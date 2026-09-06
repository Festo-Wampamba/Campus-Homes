import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { hasCoveringScope, type RoleAssignment } from '../auth/permissions';

export const STAFF_ROLE_KEYS = [
  'super_admin', 'platform_admin', 'finance_admin', 'support_admin',
  'auditor', 'ops_lead', 'ops_inspector',
];
export const SERVICE_CTX: RlsContext = {
  userId: '00000000-0000-0000-0000-000000000000', role: 'service_role',
};

/** Backend contract: intentionally independent of HTTP/shared DTOs. */
export interface AssignmentInput {
  roleKey: string;
  scopeType: string;
  scopeId?: string | null;
  validUntil?: string | Date | null;
  workerType?: string | null;
  reason: string;
}

export function assertGrantAllowed(
  permissions: Set<string>, assignments: RoleAssignment[], input: AssignmentInput,
) {
  if (input.roleKey === 'super_admin' && !permissions.has('roles.manage_super_admin')) {
    throw new ForbiddenException('Only a Super Admin can grant the super_admin role');
  }
  if (!hasCoveringScope(assignments, input.scopeType, input.scopeId ?? null)) {
    throw new ForbiddenException('Cannot grant a role outside your own scope');
  }
}

export async function recordAccessAudit(
  client: PoolClient, actor: RlsContext, action: string, targetType: string,
  targetId: string, payload: Record<string, unknown>,
) {
  await client.query(`INSERT INTO audit_log (actor_id, actor_role, action, target_type, target_id, payload)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
  [actor.userId, actor.role, action, targetType, targetId, JSON.stringify(payload)]);
}

export async function syncOpsStaff(client: PoolClient, userId: string) {
  const { rows } = await client.query<{ roleKey: string }>(`
    SELECT r.key AS "roleKey" FROM user_role_assignments a JOIN roles r ON r.id = a.role_id
    WHERE a.user_id = $1 AND r.key IN ('ops_lead', 'ops_inspector')
      AND a.revoked_at IS NULL AND a.valid_from <= now()
      AND (a.valid_until IS NULL OR a.valid_until > now())
    ORDER BY CASE r.key WHEN 'ops_lead' THEN 0 ELSE 1 END LIMIT 1`, [userId]);
  if (rows[0]) {
    await client.query(`INSERT INTO ops_staff (user_id, team, active) VALUES ($1, $2::ops_team, true)
      ON CONFLICT (user_id) DO UPDATE SET team = EXCLUDED.team, active = true`,
    [userId, rows[0].roleKey === 'ops_lead' ? 'lead' : 'inspector']);
  } else {
    await client.query('UPDATE ops_staff SET active = false WHERE user_id = $1', [userId]);
  }
}

/** Caller owns the RLS transaction. The user row lock serializes all grants,
 * including NULL scopes, whose legacy unique index does not prevent duplicates. */
export async function assignRoleInTransaction(
  client: PoolClient, actor: RlsContext, userId: string, input: AssignmentInput,
  options: { allowPending?: boolean } = {},
) {
  if (!['platform_wide', 'own', 'catchment', 'property'].includes(input.scopeType) ||
      (['catchment', 'property'].includes(input.scopeType) && !input.scopeId) ||
      (['platform_wide', 'own'].includes(input.scopeType) && input.scopeId != null)) {
    throw new BadRequestException('Invalid role assignment scope');
  }
  if (input.validUntil && (!Number.isFinite(new Date(input.validUntil).getTime()) ||
      new Date(input.validUntil).getTime() <= Date.now())) {
    throw new BadRequestException('Role validity must end in the future');
  }
  const target = (await client.query<{ id: string; status: string; deletedAt: Date | null }>(`
    SELECT id, status, deleted_at AS "deletedAt" FROM users WHERE id = $1 FOR UPDATE`, [userId])).rows[0];
  if (!target || target.deletedAt) throw new NotFoundException('User not found');
  if (target.status !== 'active' && !(options.allowPending && target.status === 'pending')) {
    throw new ForbiddenException('Cannot grant access to an inactive account');
  }
  const role = (await client.query<{ id: string }>('SELECT id FROM roles WHERE key = $1', [input.roleKey])).rows[0];
  if (!role) throw new NotFoundException('Role not found');
  if (input.scopeType === 'property') {
    const property = (await client.query('SELECT id FROM properties WHERE id = $1', [input.scopeId])).rows[0];
    if (!property) throw new NotFoundException('Property scope not found');
  }
  // Preserve history, and let an explicit new grant replace an expired one.
  await client.query(`UPDATE user_role_assignments SET revoked_at = now(), revoked_by = $5
    WHERE user_id = $1 AND role_id = $2 AND scope_type = $3 AND scope_id IS NOT DISTINCT FROM $4
      AND revoked_at IS NULL AND valid_until <= now()`,
  [userId, role.id, input.scopeType, input.scopeId ?? null, actor.userId]);
  const existing = (await client.query<{ id: string; userId: string; scopeType: string; scopeId: string | null }>(`
    SELECT id, user_id AS "userId", scope_type AS "scopeType", scope_id AS "scopeId", valid_until AS "validUntil"
    FROM user_role_assignments WHERE user_id = $1 AND role_id = $2 AND scope_type = $3
      AND scope_id IS NOT DISTINCT FROM $4 AND revoked_at IS NULL`,
  [userId, role.id, input.scopeType, input.scopeId ?? null])).rows[0];
  if (existing) return { ...existing, roleKey: input.roleKey };

  const assignment = (await client.query<{ id: string; userId: string; scopeType: string; scopeId: string | null }>(`
    INSERT INTO user_role_assignments (user_id, role_id, scope_type, scope_id, valid_until, assigned_by, reason)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, user_id AS "userId", scope_type AS "scopeType", scope_id AS "scopeId", valid_until AS "validUntil"`,
  [userId, role.id, input.scopeType, input.scopeId ?? null, input.validUntil ?? null, actor.userId, input.reason])).rows[0]!;
  if (input.scopeType === 'property' && ['landlord', 'custodian', 'property_worker', 'student'].includes(input.roleKey)) {
    await client.query(`INSERT INTO property_memberships (user_id, property_id, role, worker_type, assigned_by, ends_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, property_id, role) WHERE revoked_at IS NULL
      DO UPDATE SET status = 'active', worker_type = EXCLUDED.worker_type,
        ends_at = EXCLUDED.ends_at, assigned_by = EXCLUDED.assigned_by`,
    [userId, input.scopeId, input.roleKey === 'student' ? 'resident_student' : input.roleKey,
      input.workerType ?? null, actor.userId, input.validUntil ?? null]);
  }
  if (input.roleKey === 'ops_lead' || input.roleKey === 'ops_inspector') await syncOpsStaff(client, userId);
  await recordAccessAudit(client, actor, 'roles.assign', 'user_role_assignment', assignment.id,
    { targetUserId: userId, ...input });
  return { ...assignment, roleKey: input.roleKey };
}

@Injectable()
export class RoleAssignmentService {
  constructor(private readonly rlsDb: RlsDb) {}

  async grant(actor: RlsContext, permissions: Set<string>, scopes: RoleAssignment[], userId: string, input: AssignmentInput) {
    if (actor.userId === userId) throw new ForbiddenException('Cannot assign yourself a role');
    assertGrantAllowed(permissions, scopes, input);
    return this.rlsDb.run(SERVICE_CTX, (_db, client) => assignRoleInTransaction(client, actor, userId, input));
  }

  async revoke(actor: RlsContext, permissions: Set<string>, scopes: RoleAssignment[], assignmentId: string, userId?: string) {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const owner = (await client.query<{ userId: string }>(
        'SELECT user_id AS "userId" FROM user_role_assignments WHERE id = $1', [assignmentId])).rows[0];
      if (!owner || (userId && userId !== owner.userId)) throw new NotFoundException('Active role assignment not found');
      // Same lock order as grants and staff deactivation.
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [owner.userId]);
      const assignment = (await client.query<{ roleKey: string; scopeType: string; scopeId: string | null }>(`
        SELECT r.key AS "roleKey", a.scope_type AS "scopeType", a.scope_id AS "scopeId"
        FROM user_role_assignments a JOIN roles r ON r.id = a.role_id
        WHERE a.id = $1 AND a.revoked_at IS NULL FOR UPDATE OF a`, [assignmentId])).rows[0];
      if (!assignment) throw new NotFoundException('Active role assignment not found');
      if (assignment.roleKey === 'super_admin' &&
          (!permissions.has('roles.manage_super_admin') || owner.userId === actor.userId)) {
        throw new ForbiddenException('Cannot revoke this Super Admin role');
      }
      if (!hasCoveringScope(scopes, assignment.scopeType, assignment.scopeId)) {
        throw new ForbiddenException('Cannot revoke a role assignment outside your own scope');
      }
      await client.query('UPDATE user_role_assignments SET revoked_at = now(), revoked_by = $2 WHERE id = $1', [assignmentId, actor.userId]);
      if (assignment.scopeType === 'property' && ['landlord', 'custodian', 'property_worker', 'student'].includes(assignment.roleKey)) {
        await client.query(`UPDATE property_memberships SET status = 'revoked', revoked_at = now(), revoked_by = $4,
          revocation_reason = 'Role assignment revoked'
          WHERE user_id = $1 AND property_id = $2 AND role = $3 AND revoked_at IS NULL`,
        [owner.userId, assignment.scopeId, assignment.roleKey === 'student' ? 'resident_student' : assignment.roleKey, actor.userId]);
      }
      if (['ops_lead', 'ops_inspector'].includes(assignment.roleKey)) await syncOpsStaff(client, owner.userId);
      await recordAccessAudit(client, actor, 'roles.revoke', 'user_role_assignment', assignmentId, { targetUserId: owner.userId });
      return { id: assignmentId, revoked: true };
    });
  }

  async deactivateStaff(actor: RlsContext, permissions: Set<string>, scopes: RoleAssignment[], userId: string) {
    if (actor.userId === userId) throw new ForbiddenException('Cannot deactivate yourself');
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const target = (await client.query('SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [userId])).rows[0];
      if (!target) throw new NotFoundException('Staff member not found');
      const assignments = (await client.query<{ id: string; roleKey: string; scopeType: string; scopeId: string | null }>(`
        SELECT a.id, r.key AS "roleKey", a.scope_type AS "scopeType", a.scope_id AS "scopeId"
        FROM user_role_assignments a JOIN roles r ON r.id = a.role_id
        WHERE a.user_id = $1 AND r.key = ANY($2::text[]) AND a.revoked_at IS NULL FOR UPDATE OF a`, [userId, STAFF_ROLE_KEYS])).rows;
      if (assignments.some(a => a.roleKey === 'super_admin') && !permissions.has('roles.manage_super_admin')) {
        throw new ForbiddenException('Only a Super Admin can deactivate a Super Admin');
      }
      if (!assignments.length || !assignments.every(a => hasCoveringScope(scopes, a.scopeType, a.scopeId))) {
        throw new ForbiddenException('Cannot deactivate a staff member outside your own scope');
      }
      await client.query(`UPDATE user_role_assignments SET revoked_at = now(), revoked_by = $2
        WHERE id = ANY($1::uuid[])`, [assignments.map(a => a.id), actor.userId]);
      await syncOpsStaff(client, userId);
      await recordAccessAudit(client, actor, 'staff.deactivate', 'user', userId, { assignmentIds: assignments.map(a => a.id) });
      return { id: userId, deactivated: true };
    });
  }
}
