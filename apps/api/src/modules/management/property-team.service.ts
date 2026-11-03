import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { propertyTeamAssignmentSchema, type AssignedProperty, type OwnerPropertyTeam, type PropertyTeamAssignmentInput } from '@campushomes/shared';
import type { PoolClient } from 'pg';
import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { assignRoleInTransaction, recordAccessAudit, SERVICE_CTX } from '../staff/role-assignment.service';

const GROUND_ROLES = ['custodian', 'property_worker'];

@Injectable()
export class PropertyTeamService {
  constructor(private readonly db: RlsDb) {}

  private async ownerOf(c: PoolClient, actor: RlsContext, propertyId: string) {
    if (actor.role !== 'landlord') throw new ForbiddenException('Only the property owner can manage its team');
    const row = (await c.query(`SELECT p.id FROM properties p JOIN landlords l ON l.user_id=p.landlord_id
      JOIN users u ON u.id=l.user_id WHERE p.id=$1 AND p.landlord_id=$2 AND l.kyc_status='verified'
      AND u.status='active' AND u.deleted_at IS NULL FOR UPDATE OF p`, [propertyId, actor.userId])).rows[0];
    if (!row) throw new ForbiddenException('Only the verified owner can manage this property’s team');
  }

  owner(actor: RlsContext): Promise<OwnerPropertyTeam> {
    if (actor.role !== 'landlord') throw new ForbiddenException();
    return this.db.run(SERVICE_CTX, async (_db, c) => {
      const properties = (await c.query(`SELECT p.id,p.name FROM properties p JOIN landlords l ON l.user_id=p.landlord_id
        JOIN users u ON u.id=l.user_id WHERE p.landlord_id=$1 AND l.kyc_status='verified'
        AND u.status='active' AND u.deleted_at IS NULL ORDER BY p.name`, [actor.userId])).rows;
      const members = (await c.query(`SELECT pm.id,p.id AS "propertyId",p.name AS "propertyName",u.name,u.email,pm.role,
        pm.worker_type AS "workerType",pm.starts_at AS "startsAt",
        CASE WHEN pm.revoked_at IS NOT NULL OR pm.status='revoked' THEN 'revoked'
          WHEN pm.ends_at<=now() THEN 'expired' WHEN u.status<>'active' OR u.deleted_at IS NOT NULL THEN 'inactive'
          WHEN pm.status<>'active' THEN pm.status ELSE 'active' END AS status
        FROM property_memberships pm JOIN properties p ON p.id=pm.property_id JOIN users u ON u.id=pm.user_id
        JOIN landlords l ON l.user_id=p.landlord_id WHERE p.landlord_id=$1 AND l.kyc_status='verified'
        AND pm.role=ANY($2::text[]) ORDER BY pm.revoked_at NULLS FIRST,p.name,pm.created_at DESC LIMIT 500`,
      [actor.userId, GROUND_ROLES])).rows;
      return { properties, members };
    });
  }

  assign(actor: RlsContext, raw: PropertyTeamAssignmentInput) {
    const parsed = propertyTeamAssignmentSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid property assignment');
    const input = parsed.data;
    return this.db.run(SERVICE_CTX, async (_db, c) => {
      await this.ownerOf(c, actor, input.propertyId);
      const targets = (await c.query<{ id: string; role: string; status: string; deletedAt: Date | null; verified: boolean }>(
        `SELECT id,role,status,deleted_at AS "deletedAt",email_verified AS verified FROM users
        WHERE lower(btrim(email))=$1 FOR UPDATE`, [input.email])).rows;
      if (targets.length > 1) throw new ConflictException('This email matches multiple accounts. Contact CampusHomes support');
      const target = targets[0];
      if (!target) throw new NotFoundException('This person must first register a CampusHomes account and verify their email');
      if (target.id === actor.userId) throw new BadRequestException('Choose a separate team member account');
      if (target.status !== 'active' || target.deletedAt || !target.verified || ['admin','ops_lead','ops_inspector'].includes(target.role))
        throw new ForbiddenException('Choose an active, email-verified customer account for the property team');
      const assignment = await assignRoleInTransaction(c, actor, target.id, { roleKey: input.role, scopeType: 'property',
        scopeId: input.propertyId, workerType: input.workerType, reason: input.reason });
      await c.query(`UPDATE user_role_assignments SET valid_from=LEAST(valid_from,now()),valid_until=NULL WHERE id=$1`, [assignment.id]);
      // Also reconcile a legacy membership if an existing role grant was returned.
      const membership = (await c.query<{ id: string }>(`INSERT INTO property_memberships
        (user_id,property_id,role,worker_type,assigned_by) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(user_id,property_id,role) WHERE revoked_at IS NULL
        DO UPDATE SET status='active',worker_type=EXCLUDED.worker_type,starts_at=LEAST(property_memberships.starts_at,now()),ends_at=NULL,assigned_by=EXCLUDED.assigned_by
        RETURNING id`, [target.id, input.propertyId, input.role, input.workerType ?? null, actor.userId])).rows[0]!;
      await recordAccessAudit(c, actor, 'property_team.assign', 'property_membership', membership.id,
        { propertyId: input.propertyId, role: input.role, workerType: input.workerType ?? null, reason: input.reason });
      return membership;
    });
  }

  revoke(actor: RlsContext, membershipId: string) {
    return this.db.run(SERVICE_CTX, async (_db, c) => {
      const member = (await c.query<{ propertyId: string; userId: string; role: string }>(`SELECT property_id AS "propertyId",
        user_id AS "userId",role FROM property_memberships WHERE id=$1 AND role=ANY($2::text[])`,
      [membershipId, GROUND_ROLES])).rows[0];
      if (!member) throw new NotFoundException('Property team assignment not found');
      await this.ownerOf(c, actor, member.propertyId);
      await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [member.userId]);
      const current = (await c.query(`SELECT id FROM property_memberships
        WHERE id=$1 AND revoked_at IS NULL FOR UPDATE`, [membershipId])).rows[0];
      // Replaying removal of an old membership must not revoke a later grant.
      if (!current) return { revoked: true };
      await c.query(`UPDATE user_role_assignments SET revoked_at=now(),revoked_by=$4
        WHERE user_id=$1 AND scope_type='property' AND scope_id=$2 AND revoked_at IS NULL
        AND role_id=(SELECT id FROM roles WHERE key=$3)`, [member.userId, member.propertyId, member.role, actor.userId]);
      await c.query(`UPDATE property_memberships SET status='revoked',revoked_at=now(),revoked_by=$2,
        revocation_reason='Removed by property owner' WHERE id=$1 AND revoked_at IS NULL`, [membershipId, actor.userId]);
      await recordAccessAudit(c, actor, 'property_team.revoke', 'property_membership', membershipId, { propertyId: member.propertyId });
      return { revoked: true };
    });
  }

  mine(actor: RlsContext): Promise<AssignedProperty[]> {
    return this.db.run(SERVICE_CTX, async (_db, c) => (await c.query(`SELECT pm.id,p.id AS "propertyId",p.name,
      p.street_address AS "streetAddress",pm.role,pm.worker_type AS "workerType",owner.name AS "ownerName",
      p.contact_phone AS "contactPhone" FROM property_memberships pm JOIN properties p ON p.id=pm.property_id
      JOIN users u ON u.id=pm.user_id JOIN users owner ON owner.id=p.landlord_id
      JOIN landlords l ON l.user_id=p.landlord_id WHERE pm.user_id=$1 AND pm.role=ANY($2::text[])
      AND pm.revoked_at IS NULL AND pm.status='active' AND pm.starts_at<=now() AND (pm.ends_at IS NULL OR pm.ends_at>now())
      AND u.status='active' AND u.deleted_at IS NULL AND owner.status='active' AND owner.deleted_at IS NULL AND l.kyc_status='verified'
      AND EXISTS(SELECT 1 FROM user_role_assignments a JOIN roles r ON r.id=a.role_id WHERE a.user_id=pm.user_id
        AND r.key=pm.role AND a.scope_type='property' AND a.scope_id=p.id::text AND a.revoked_at IS NULL
        AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now())) ORDER BY p.name,pm.role`,
    [actor.userId, GROUND_ROLES])).rows);
  }
}
