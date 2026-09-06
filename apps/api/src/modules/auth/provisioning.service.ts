import { randomUUID } from 'node:crypto';

import { ConflictException, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import {
  acceptInvitationsInTransaction,
  pendingInvitationsForIdentity,
} from '../staff/invitations.service';
import {
  assignRoleInTransaction,
  STAFF_ROLE_KEYS,
} from '../staff/role-assignment.service';
import type { Portal } from './logto.config';

const SERVICE_CTX: RlsContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'service_role',
};

const STAFF_LEGACY_ROLE: Record<string, 'admin' | 'ops_lead' | 'ops_inspector'> = {
  ops_lead: 'ops_lead',
  ops_inspector: 'ops_inspector',
  super_admin: 'admin',
  platform_admin: 'admin',
  finance_admin: 'admin',
  support_admin: 'admin',
  auditor: 'admin',
};

export interface LogtoIdentityClaims {
  sub: string;
  email?: string | null;
  phoneNumber?: string | null;
  name?: string | null;
  /** These values must come from validated provider claims. Contact
   * presence alone is never proof that the current identity owns it. */
  emailVerified?: boolean;
  phoneVerified?: boolean;
}

export interface ProvisionedUser {
  id: string;
  role: string;
  status: string;
}

interface IdentityRow extends ProvisionedUser {
  deletedAt: Date | null;
}

/** Links one validated Logto identity to one local account and accepts any
 * matching staff invitation in the same database transaction. */
@Injectable()
export class ProvisioningService {
  constructor(private readonly rlsDb: RlsDb) {}

  async provision(claims: LogtoIdentityClaims, portal: Portal): Promise<ProvisionedUser | null> {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      await this.lockIdentity(client, claims);

      const pending = await pendingInvitationsForIdentity(client, claims);
      let user = await this.byLogtoId(client, claims.sub);
      if (user?.deletedAt) return null;

      if (!user) user = await this.findAndLinkVerifiedCandidate(client, claims);

      if (!user && pending.length) {
        const firstRole = pending[0]?.roleKey;
        const legacyRole = firstRole ? STAFF_LEGACY_ROLE[firstRole] : undefined;
        if (!legacyRole) return null;
        user = await this.createUser(client, claims, legacyRole);
      }

      if (!user && portal === 'staff') return null;

      if (!user) {
        user = await this.createUser(client, claims, 'student');
        await assignRoleInTransaction(
          client,
          { userId: user.id, role: 'service_role' },
          user.id,
          {
            roleKey: 'student',
            scopeType: 'own',
            reason: 'Initial role assigned during verified identity provisioning',
          },
        );
      }

      if (user.status === 'active' && pending.length) {
        await acceptInvitationsInTransaction(client, user.id, claims, pending);
      }

      return (await this.isEligible(client, user, portal)) ? this.publicUser(user) : null;
    });
  }

  /** Serialize both the provider subject and verified contact identifiers.
   * Sorting produces the same lock order for all concurrent callbacks. */
  private async lockIdentity(client: PoolClient, claims: LogtoIdentityClaims) {
    const keys = [`sub:${claims.sub}`];
    if (claims.email) keys.push(`email:${claims.email.trim().toLowerCase()}`);
    if (claims.phoneNumber) keys.push(`phone:${claims.phoneNumber.trim()}`);
    for (const key of keys.sort()) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key]);
    }
  }

  private async byLogtoId(client: PoolClient, sub: string): Promise<IdentityRow | null> {
    const row = (await client.query<IdentityRow>(`
      SELECT id, role::text, status::text, deleted_at AS "deletedAt"
      FROM users WHERE logto_user_id = $1 FOR UPDATE
    `, [sub])).rows[0];
    return row ?? null;
  }

  private async findAndLinkVerifiedCandidate(
    client: PoolClient,
    claims: LogtoIdentityClaims,
  ): Promise<IdentityRow | null> {
    const email = claims.emailVerified === true && claims.email
      ? claims.email.trim().toLowerCase()
      : null;
    const phone = claims.phoneVerified === true && claims.phoneNumber
      ? claims.phoneNumber.trim()
      : null;
    if (!email && !phone) return null;

    const matches = (await client.query<IdentityRow & { logtoUserId: string | null }>(`
      SELECT id, role::text, status::text, deleted_at AS "deletedAt",
        logto_user_id AS "logtoUserId"
      FROM users
      WHERE deleted_at IS NULL AND (
        ($1::text IS NOT NULL AND lower(btrim(email)) = $1) OR
        ($2::text IS NOT NULL AND phone = $2)
      )
      ORDER BY id FOR UPDATE
    `, [email, phone])).rows;

    if (matches.length > 1) {
      throw new ConflictException('Verified identity contacts identify different accounts');
    }
    const candidate = matches[0];
    if (!candidate) return null;
    if (candidate.logtoUserId && candidate.logtoUserId !== claims.sub) {
      throw new ConflictException('Verified contact is already linked to another identity');
    }
    if (candidate.logtoUserId === claims.sub) return candidate;

    const linked = (await client.query<IdentityRow>(`
      UPDATE users SET logto_user_id = $2,
        email_verified = email_verified OR ($3::boolean AND email IS NOT NULL AND lower(btrim(email)) = $4),
        phone_verified = phone_verified OR ($5::boolean AND phone IS NOT NULL AND phone = $6),
        updated_at = now()
      WHERE id = $1 AND logto_user_id IS NULL
      RETURNING id, role::text, status::text, deleted_at AS "deletedAt"
    `, [candidate.id, claims.sub, claims.emailVerified === true, email,
      claims.phoneVerified === true, phone])).rows[0];
    if (!linked) throw new ConflictException('Account identity changed during sign-in');
    return linked;
  }

  private async createUser(
    client: PoolClient,
    claims: LogtoIdentityClaims,
    role: 'student' | 'admin' | 'ops_lead' | 'ops_inspector',
  ): Promise<IdentityRow> {
    const email = claims.email?.trim().toLowerCase() || null;
    const phone = claims.phoneNumber?.trim() || null;
    const conflict = (await client.query(`
      SELECT id FROM users WHERE deleted_at IS NULL AND (
        ($1::text IS NOT NULL AND lower(btrim(email)) = $1) OR
        ($2::text IS NOT NULL AND phone = $2)
      ) LIMIT 1
    `, [email, phone])).rows[0];
    if (conflict) {
      throw new ConflictException('Contact is already associated with another CampusHomes account');
    }
    const created = (await client.query<IdentityRow>(`
      INSERT INTO users (
        id, logto_user_id, phone, email, name, role, status,
        phone_verified, email_verified
      ) VALUES ($1, $2, $3, $4, $5, $6::user_role, 'active', $7, $8)
      RETURNING id, role::text, status::text, deleted_at AS "deletedAt"
    `, [randomUUID(), claims.sub, phone, email, claims.name?.trim() ?? '', role,
      claims.phoneVerified === true, claims.emailVerified === true])).rows[0];
    if (!created) throw new Error('User insert returned no row');
    return created;
  }

  private async isEligible(client: PoolClient, user: IdentityRow, portal: Portal): Promise<boolean> {
    if (user.deletedAt || user.status === 'suspended') return false;
    if (portal !== 'staff') return user.status === 'active' || user.status === 'pending';
    if (user.status !== 'active') return false;
    const row = (await client.query(`
      SELECT 1 FROM user_role_assignments a
      JOIN roles r ON r.id = a.role_id
      WHERE a.user_id = $1 AND r.key = ANY($2::text[])
        AND a.revoked_at IS NULL AND a.valid_from <= now()
        AND (a.valid_until IS NULL OR a.valid_until > now())
      LIMIT 1
    `, [user.id, STAFF_ROLE_KEYS])).rows[0];
    return Boolean(row);
  }

  private publicUser(user: IdentityRow): ProvisionedUser {
    return { id: user.id, role: user.role, status: user.status };
  }
}
