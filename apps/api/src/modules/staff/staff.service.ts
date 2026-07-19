import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import type { GrantRoleInput, InviteStaffInput, StaffRoleKey, UserRole } from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { roles, userRoleAssignments, users } from '../../db/schema';
import { hasCoveringScope, type RoleAssignment } from '../auth/permissions';
import { AuditService } from '../ops/audit.service';

const SERVICE_CTX: RlsContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'service_role',
};

// Which existing app.user_role value a granted StaffRoleKey maps onto — RLS
// keeps branching on the locked 5-value enum; fine-grained gating is
// PermissionsGuard. ops_lead/ops_inspector already have their own RLS-tested
// enum values, so they map 1:1 instead of collapsing into 'admin'.
const ROLE_TO_DB_ROLE: Record<StaffRoleKey, UserRole> = {
  super_admin: 'admin',
  platform_admin: 'admin',
  finance_admin: 'admin',
  support_admin: 'admin',
  auditor: 'admin',
  ops_lead: 'ops_lead',
  ops_inspector: 'ops_inspector',
};

@Injectable()
export class StaffService {
  constructor(
    private readonly rlsDb: RlsDb,
    private readonly audit: AuditService,
  ) {}

  async invite(
    actorCtx: RlsContext,
    actorPermissions: Set<string>,
    actorAssignments: RoleAssignment[],
    input: InviteStaffInput,
  ) {
    const dbRole = ROLE_TO_DB_ROLE[input.roleKey];
    const user = await this.rlsDb.run(SERVICE_CTX, async (db) => {
      const [row] = await db
        .insert(users)
        .values({
          name: input.name,
          email: input.email,
          phone: input.phone,
          role: dbRole,
          status: 'pending',
        })
        .returning();
      return row!; // plain insert, no onConflict — always returns exactly one row
    });
    await this.grantRole(actorCtx, actorPermissions, actorAssignments, user.id, input);
    return user;
  }

  list() {
    return this.rlsDb.run(SERVICE_CTX, (db) =>
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          phone: users.phone,
          role: users.role,
          status: users.status,
        })
        .from(users)
        .where(inArray(users.role, ['admin', 'ops_lead', 'ops_inspector'])),
    );
  }

  async deactivate(actorCtx: RlsContext, actorAssignments: RoleAssignment[], targetUserId: string) {
    if (actorCtx.userId === targetUserId) {
      throw new ForbiddenException('Cannot deactivate yourself');
    }
    return this.rlsDb.run(SERVICE_CTX, async (db) => {
      const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, targetUserId));
      if (!target) throw new NotFoundException('Staff member not found');

      const targetAssignments = await db
        .select({ scopeType: userRoleAssignments.scopeType, scopeId: userRoleAssignments.scopeId })
        .from(userRoleAssignments)
        .where(and(eq(userRoleAssignments.userId, targetUserId), isNull(userRoleAssignments.revokedAt)));
      const covered = targetAssignments.some((a) => hasCoveringScope(actorAssignments, a.scopeType, a.scopeId));
      if (!covered) {
        throw new ForbiddenException('Cannot deactivate a staff member outside your own scope');
      }

      const [row] = await db
        .update(users)
        .set({ status: 'suspended' })
        .where(eq(users.id, targetUserId))
        .returning();
      const updated = row!; // target existence already confirmed above
      await this.audit.record(actorCtx, 'staff.deactivate', 'user', targetUserId, {});
      return updated;
    });
  }

  async grantRole(
    actorCtx: RlsContext,
    actorPermissions: Set<string>,
    actorAssignments: RoleAssignment[],
    targetUserId: string,
    input: GrantRoleInput | InviteStaffInput,
  ) {
    if (actorCtx.userId === targetUserId) {
      throw new ForbiddenException('Cannot assign yourself a role');
    }
    if (input.roleKey === 'super_admin' && !actorPermissions.has('roles.manage_super_admin')) {
      throw new ForbiddenException('Only a Super Admin can grant the super_admin role');
    }
    if (!hasCoveringScope(actorAssignments, input.scopeType, input.scopeId ?? null)) {
      throw new ForbiddenException('Cannot grant a role outside your own scope');
    }

    return this.rlsDb.run(SERVICE_CTX, async (db) => {
      const [role] = await db.select().from(roles).where(eq(roles.key, input.roleKey));
      if (!role) throw new NotFoundException(`Unknown role ${input.roleKey}`);

      await db
        .update(users)
        .set({ role: ROLE_TO_DB_ROLE[input.roleKey] })
        .where(eq(users.id, targetUserId));

      const [insertedAssignment] = await db
        .insert(userRoleAssignments)
        .values({
          userId: targetUserId,
          roleId: role.id,
          scopeType: input.scopeType,
          scopeId: input.scopeId ?? null,
          assignedBy: actorCtx.userId,
          reason: input.reason,
          validUntil: input.validUntil ? new Date(input.validUntil) : null,
        })
        .returning();
      const assignment = insertedAssignment!; // plain insert, no onConflict — always returns exactly one row

      await this.audit.record(actorCtx, 'roles.assign', 'user_role_assignment', assignment.id, {
        targetUserId,
        roleKey: input.roleKey,
        scopeType: input.scopeType,
        scopeId: input.scopeId ?? null,
        reason: input.reason,
      });
      return assignment;
    });
  }

  revokeRole(actorCtx: RlsContext, actorAssignments: RoleAssignment[], assignmentId: string) {
    return this.rlsDb.run(SERVICE_CTX, async (db) => {
      const [target] = await db
        .select({ scopeType: userRoleAssignments.scopeType, scopeId: userRoleAssignments.scopeId })
        .from(userRoleAssignments)
        .where(and(eq(userRoleAssignments.id, assignmentId), isNull(userRoleAssignments.revokedAt)));
      if (!target) throw new NotFoundException('Active role assignment not found');
      if (!hasCoveringScope(actorAssignments, target.scopeType, target.scopeId)) {
        throw new ForbiddenException('Cannot revoke a role assignment outside your own scope');
      }

      const [row] = await db
        .update(userRoleAssignments)
        .set({ revokedAt: new Date(), revokedBy: actorCtx.userId })
        .where(and(eq(userRoleAssignments.id, assignmentId), isNull(userRoleAssignments.revokedAt)))
        .returning();
      if (!row) throw new NotFoundException('Active role assignment not found');
      await this.audit.record(actorCtx, 'roles.revoke', 'user_role_assignment', assignmentId, {});
      return row;
    });
  }
}
