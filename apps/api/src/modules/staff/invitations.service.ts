import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';

import { z } from 'zod';
import { loadEnv } from '../../config/env';
import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import type { RoleAssignment } from '../auth/permissions';
import { LogtoManagementClient } from '../auth/logto-management.client';
import {
  assertGrantAllowed, assignRoleInTransaction, recordAccessAudit, SERVICE_CTX, STAFF_ROLE_KEYS,
  type AssignmentInput,
} from './role-assignment.service';

export interface VerifiedIdentityContacts {
  sub: string;
  email?: string | null;
  emailVerified?: boolean;
  phoneNumber?: string | null;
  phoneVerified?: boolean;
}

export function verifiedContacts(claims: VerifiedIdentityContacts) {
  return {
    email: claims.emailVerified === true && claims.email ? claims.email.trim().toLowerCase() : null,
    phone: claims.phoneVerified === true && claims.phoneNumber ? normalizePhone(claims.phoneNumber) : null,
  };
}

function normalizePhone(phone: string) {
  const normalized = phone.trim().replace(/^\+?/, '+');
  if (!/^\+[1-9]\d{5,14}$/.test(normalized)) throw new BadRequestException('Invalid identity phone');
  return normalized;
}

export interface StaffInvitationInput extends AssignmentInput {
  name: string;
  email: string;
  phone?: string;
}

interface Invitation extends AssignmentInput {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  invitedBy: string;
  targetUserId: string | null;
  expiresAt: Date;
  status: 'pending' | 'accepted' | 'cancelled';
  deliveryAttempts: number;
  lastDeliveryError: string | null;
  deliveredAt: Date | null;
  createdAt: Date;
}

const INVITATION_COLUMNS = `id, name, email, phone, role_key AS "roleKey", scope_type AS "scopeType",
  scope_id AS "scopeId", valid_until AS "validUntil", reason, invited_by AS "invitedBy",
  target_user_id AS "targetUserId", expires_at AS "expiresAt", status,
  delivery_attempts AS "deliveryAttempts", last_delivery_error AS "lastDeliveryError",
  delivered_at AS "deliveredAt", created_at AS "createdAt"`;

/** Verified email is the invitation proof; the one-time token verifies that
 * contact at Logto but never supplies MFA or bypasses account binding.
 * Call before creating a new staff identity and again, locked, when accepting. */
export async function pendingInvitationsForIdentity(client: PoolClient, claims: VerifiedIdentityContacts) {
  const { email, phone } = verifiedContacts(claims);
  if (!email && !phone) return [];
  return (await client.query<Invitation>(`SELECT ${INVITATION_COLUMNS} FROM auth_invitations
    WHERE status = 'pending' AND expires_at > now()
      AND (valid_until IS NULL OR valid_until > now())
      AND (
        (email IS NOT NULL AND email = $1) OR
        (email IS NULL AND phone IS NOT NULL AND phone = $2)
      )
    ORDER BY id FOR UPDATE`, [email, phone])).rows;
}

/** No RlsDb.run here: link, acceptance, and role grant commit together. */
export async function acceptInvitationsInTransaction(
  client: PoolClient, userId: string, claims: VerifiedIdentityContacts, pending?: Invitation[],
) {
  const invitations = pending ?? await pendingInvitationsForIdentity(client, claims);
  if (!invitations.length) return;
  const target = (await client.query<{ id: string }>(`SELECT id FROM users
    WHERE id = $1 AND logto_user_id = $2 AND status = 'active' AND deleted_at IS NULL FOR UPDATE`,
  [userId, claims.sub])).rows[0];
  if (!target) throw new ForbiddenException('Invitation requires an active linked identity');
  for (const invitation of invitations) {
    if (invitation.targetUserId && invitation.targetUserId !== userId) {
      throw new ConflictException('Invitation belongs to another account');
    }
    const assignment = await assignRoleInTransaction(client,
      { userId: invitation.invitedBy, role: 'service_role' }, userId, invitation);
    await client.query(`UPDATE auth_invitations SET status = 'accepted', accepted_at = now(),
      accepted_by = $2, assignment_id = $3, updated_at = now() WHERE id = $1 AND status = 'pending'`,
    [invitation.id, userId, assignment.id]);
    await recordAccessAudit(client, { userId, role: 'service_role' }, 'staff.invitation.accept',
      'auth_invitation', invitation.id, { assignmentId: assignment.id });
  }
}

@Injectable()
export class InvitationDeliveryService {
  constructor(private readonly logto: LogtoManagementClient) {}

  async send(invitation: Pick<Invitation, 'email' | 'expiresAt' | 'validUntil'>): Promise<void> {
    const env = loadEnv();
    if (!invitation.email) throw new Error('Staff invitations require email; create a new email invitation');
    const expiresAt = Math.min(new Date(invitation.expiresAt).getTime(),
      invitation.validUntil ? new Date(invitation.validUntil).getTime() : Infinity);
    const expiresIn = Math.floor((expiresAt - Date.now()) / 1000);
    if (!Number.isFinite(expiresIn) || expiresIn < 1) throw new Error('Invitation has expired');
    if (!env.RESEND_API_KEY) throw new Error('Invitation email delivery is not configured');
    const { token } = await this.logto.createOneTimeToken(invitation.email, 'SignIn', expiresIn);
    const url = new URL('/api/auth/logto/sign-in', env.WEB_ORIGIN);
    url.search = new URLSearchParams({ portal: 'staff', intent: 'staff', token, email: invitation.email }).toString();
    const message = `You have been invited to CampusHomes staff. Open this one-time link to verify your email and complete staff sign-in: ${url.toString()}. This link expires at ${new Date(expiresAt).toISOString()}. Staff access also requires authenticator verification.`;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.AUTH_EMAIL_FROM, to: [invitation.email],
        subject: 'Your CampusHomes staff invitation', text: message }),
    });
    if (!response.ok) throw new Error('Invitation email delivery failed');
  }
}

@Injectable()
export class InvitationsService {
  constructor(private readonly rlsDb: RlsDb, private readonly delivery: InvitationDeliveryService) {}

  async invite(actor: RlsContext, permissions: Set<string>, scopes: RoleAssignment[], input: StaffInvitationInput) {
    assertGrantAllowed(permissions, scopes, input);
    if (!STAFF_ROLE_KEYS.includes(input.roleKey)) throw new BadRequestException('Invitation must grant a staff role');
    if (!['platform_wide', 'catchment'].includes(input.scopeType) ||
      (input.scopeType === 'catchment' && !input.scopeId) ||
      (input.scopeType === 'platform_wide' && input.scopeId != null)) {
      throw new BadRequestException('Invalid invitation scope');
    }
    if (input.validUntil && (!Number.isFinite(new Date(input.validUntil).getTime()) || new Date(input.validUntil).getTime() <= Date.now())) {
      throw new BadRequestException('Role validity must end in the future');
    }
    const email = input.email?.trim().toLowerCase() ?? null;
    const phone = input.phone ? normalizePhone(input.phone) : null;
    if (!z.email().safeParse(email).success) throw new BadRequestException('A valid invitation email is required');
    const invitation = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      // Serialize duplicate invitations without holding a network call open.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`invite:${email ?? phone}`]);
      const targets = (await client.query<{ id: string; status: string; deletedAt: Date | null }>(`
        SELECT id, status, deleted_at AS "deletedAt" FROM users
        WHERE ($1::text IS NOT NULL AND lower(btrim(email)) = $1) OR ($2::text IS NOT NULL AND phone = $2)`, [email, phone])).rows;
      if (targets.length > 1) throw new ConflictException('Invitation contacts identify different accounts');
      const target = targets[0];
      if (target?.id === actor.userId) throw new ForbiddenException('Cannot invite yourself');
      if (target && (target.deletedAt || target.status !== 'active')) throw new ForbiddenException('Cannot invite an inactive account');
      const role = (await client.query('SELECT id FROM roles WHERE key = $1', [input.roleKey])).rows[0];
      if (!role) throw new NotFoundException('Role not found');
      const existing = (await client.query<Invitation>(`SELECT ${INVITATION_COLUMNS} FROM auth_invitations
        WHERE email IS NOT DISTINCT FROM $1 AND phone IS NOT DISTINCT FROM $2 AND role_key = $3
          AND scope_type = $4 AND scope_id IS NOT DISTINCT FROM $5 AND status = 'pending'
        FOR UPDATE`, [email, phone, input.roleKey, input.scopeType, input.scopeId ?? null])).rows[0];
      if (existing) return existing;
      const created = (await client.query<Invitation>(`INSERT INTO auth_invitations
        (name, email, phone, role_key, scope_type, scope_id, valid_until, reason, invited_by, target_user_id, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now() + interval '7 days')
        RETURNING ${INVITATION_COLUMNS}`,
      [input.name, email, phone, input.roleKey, input.scopeType, input.scopeId ?? null,
        input.validUntil ?? null, input.reason, actor.userId, target?.id ?? null])).rows[0]!;
      await recordAccessAudit(client, actor, 'staff.invite', 'auth_invitation', created.id, { roleKey: input.roleKey });
      return created;
    });
    // An identical create request is idempotent; explicit retry renews expiry.
    if (invitation.deliveryAttempts > 0) return invitation;
    return this.deliver(invitation.id);
  }

  list(scopes: RoleAssignment[]) {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const rows = (await client.query<Invitation>(`SELECT ${INVITATION_COLUMNS} FROM auth_invitations ORDER BY created_at DESC`)).rows;
      return rows.filter(row => scopes.some(scope => scope.scopeType === 'platform_wide' ||
        (scope.scopeType === row.scopeType && (scope.scopeId === row.scopeId ||
          (scope.scopeType === 'catchment' && scope.scopeId === 'all')))));
    });
  }

  async cancel(actor: RlsContext, permissions: Set<string>, scopes: RoleAssignment[], id: string) {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const row = (await client.query<Invitation>(`SELECT ${INVITATION_COLUMNS} FROM auth_invitations WHERE id = $1 FOR UPDATE`, [id])).rows[0];
      if (!row) throw new NotFoundException('Invitation not found');
      assertGrantAllowed(permissions, scopes, row);
      if (row.status === 'accepted') throw new ConflictException('Accepted invitations cannot be cancelled; revoke the assignment');
      if (row.status === 'cancelled') return { id, cancelled: true };
      await client.query(`UPDATE auth_invitations SET status = 'cancelled', cancelled_at = now(), cancelled_by = $2,
        updated_at = now() WHERE id = $1`, [id, actor.userId]);
      await recordAccessAudit(client, actor, 'staff.invitation.cancel', 'auth_invitation', id, {});
      return { id, cancelled: true };
    });
  }

  async retry(actor: RlsContext, permissions: Set<string>, scopes: RoleAssignment[], id: string) {
    await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const row = (await client.query<Invitation>(`SELECT ${INVITATION_COLUMNS} FROM auth_invitations WHERE id = $1 FOR UPDATE`, [id])).rows[0];
      if (!row) throw new NotFoundException('Invitation not found');
      assertGrantAllowed(permissions, scopes, row);
      if (row.status !== 'pending') throw new ConflictException('Only pending invitations can be retried');
      if (row.validUntil && new Date(row.validUntil).getTime() <= Date.now()) throw new ConflictException('The invited role has expired');
      await client.query(`UPDATE auth_invitations SET expires_at = now() + interval '7 days', updated_at = now() WHERE id = $1`, [id]);
      await recordAccessAudit(client, actor, 'staff.invitation.retry', 'auth_invitation', id, {});
    });
    return this.deliver(id);
  }

  private async deliver(id: string) {
    const row = await this.rlsDb.run(SERVICE_CTX, async (_db, client) =>
      (await client.query<Invitation>(`UPDATE auth_invitations SET delivery_attempts = delivery_attempts + 1,
        last_delivery_attempt_at = now() WHERE id = $1 AND status = 'pending' AND expires_at > now()
          AND (valid_until IS NULL OR valid_until > now())
          AND (last_delivery_attempt_at IS NULL OR last_delivery_attempt_at < now() - interval '1 minute')
        RETURNING ${INVITATION_COLUMNS}`, [id])).rows[0]);
    if (!row) return { id, delivery: 'not_sent' };
    let failed = false;
    try { await this.delivery.send(row); } catch { failed = true; }
    await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      await client.query(`UPDATE auth_invitations SET last_delivery_error = $2,
        delivered_at = CASE WHEN $2::text IS NULL THEN now() ELSE delivered_at END, updated_at = now()
        WHERE id = $1 AND delivery_attempts = $3`,
      [id, failed ? 'Delivery failed; retry invitation' : null, row.deliveryAttempts]);
    });
    return { ...row, lastDeliveryError: failed ? 'Delivery failed; retry invitation' : null,
      delivery: failed ? 'failed' : 'sent' };
  }
}
