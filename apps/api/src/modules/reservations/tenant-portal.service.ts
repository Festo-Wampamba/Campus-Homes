import { createHash, randomBytes } from 'node:crypto';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';

import { TENANCY_CLAIM_TTL_HOURS, normalizeTenancyClaimCode, type TenancyClaimIssued } from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../ops/audit.service';

const SERVICE = (userId: string): RlsContext => ({ userId, role: 'service_role' });

// Crockford base32: no I, L, O or U, so a code read aloud or copied by hand
// can't be mistyped into another valid one.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 10; // 50 bits; redeeming is rate limited per session

// One answer for every failure, so a guess learns nothing about which codes
// exist, were used or were revoked.
const INVALID_CODE = 'This code is not valid or has expired. Ask your landlord for a new one.';

const hashCode = (code: string): string => createHash('sha256').update(normalizeTenancyClaimCode(code)).digest('hex');

function newCode(): string {
  // 256 is a multiple of 32, so the modulo keeps every character equally likely.
  return Array.from(randomBytes(CODE_LENGTH), (byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

/** Lets a tenant the landlord recorded privately (0088) open a student
 * portal on the same booking, receipts and balance (0090). The landlord
 * issues a single-use code for that one record; a signed-in student redeems
 * it. Names, room numbers and the public property QR prove nothing. */
@Injectable()
export class TenantPortalService {
  constructor(
    private readonly rlsDb: RlsDb,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** A new code for this tenant record; any earlier one stops working. */
  async issue(ctx: RlsContext, reservationId: string): Promise<TenancyClaimIssued> {
    const code = newCode();
    const issued = await this.rlsDb.run(SERVICE(ctx.userId), async (_db, client) => {
      const tenant = await this.ownPrivateTenant(client, ctx.userId, reservationId);
      await this.revokePending(client, tenant.id);
      return (await client.query<{ id: string; expires_at: Date }>(
        `INSERT INTO tenancy_claims(tenant_user_id, property_id, code_hash, created_by, expires_at)
         VALUES ($1, $2, $3, $4, now() + make_interval(hours => $5)) RETURNING id, expires_at`,
        [tenant.id, tenant.property_id, hashCode(code), ctx.userId, TENANCY_CLAIM_TTL_HOURS],
      )).rows[0]!;
    });
    await this.audit.record(ctx, 'tenancy_claim.issue', 'tenancy_claim', issued.id, { reservationId });
    return { code: `${code.slice(0, 5)}-${code.slice(5)}`, expiresAt: issued.expires_at };
  }

  async revoke(ctx: RlsContext, reservationId: string): Promise<{ revoked: boolean }> {
    const revoked = await this.rlsDb.run(SERVICE(ctx.userId), async (_db, client) => {
      const tenant = await this.ownPrivateTenant(client, ctx.userId, reservationId);
      return this.revokePending(client, tenant.id);
    });
    if (revoked) await this.audit.record(ctx, 'tenancy_claim.revoke', 'tenancy_claim', revoked, { reservationId });
    return { revoked: revoked !== null };
  }

  /** Moves the private record's bookings to the signed-in student. Booking
   * status, bed, amounts and arrival stay exactly as the landlord recorded
   * them. Receipts are append-only and keep the name they were issued to;
   * the student reads them through the booking (ReservationsService.receipts). */
  async redeem(ctx: RlsContext, code: string): Promise<{ linked: true }> {
    const result = await this.rlsDb.run(SERVICE(ctx.userId), async (_db, client) => {
      const claim = (await client.query<{
        id: string; tenant_user_id: string; property_id: string; status: string; claimed_by: string | null; expired: boolean;
      }>(
        `SELECT id, tenant_user_id, property_id, status, claimed_by, expires_at <= now() AS expired
         FROM tenancy_claims WHERE code_hash = $1 FOR UPDATE`, [hashCode(code)],
      )).rows[0];
      // Replaying your own redeemed code is a no-op, not an error.
      if (claim?.status === 'claimed' && claim.claimed_by === ctx.userId) return null;
      if (!claim || claim.status !== 'pending' || claim.expired) throw new NotFoundException(INVALID_CODE);

      const student = await client.query(
        `SELECT 1 FROM users u JOIN students s ON s.user_id = u.id
         WHERE u.id = $1 AND u.status = 'active' AND u.deleted_at IS NULL
           AND u.logto_user_id IS NOT NULL AND u.tenancy_property_id IS NULL`, [ctx.userId],
      );
      if (!student.rows.length) throw new ForbiddenException('Finish setting up your student profile, then enter the code again.');

      // Same lock a student's own reserve takes, so the two can't interleave.
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('reservation-student:' || $1, 0))`, [ctx.userId]);
      await client.query(`UPDATE reservations SET student_id = $2, updated_at = now() WHERE student_id = $1`, [claim.tenant_user_id, ctx.userId]);
      await client.query(
        `UPDATE tenancy_claims SET status = 'claimed', claimed_by = $2, claimed_at = now() WHERE id = $1`, [claim.id, ctx.userId],
      );
      const property = (await client.query<{ landlord_id: string; name: string; tenant_name: string | null }>(
        `SELECT p.landlord_id, p.name, NULLIF(btrim(u.name), '') AS tenant_name
         FROM properties p JOIN users u ON u.id = $2 WHERE p.id = $1`, [claim.property_id, claim.tenant_user_id],
      )).rows[0]!;
      return { claim, property };
    });
    if (!result) return { linked: true };

    await this.audit.record(ctx, 'tenancy_claim.redeem', 'tenancy_claim', result.claim.id, {
      tenantUserId: result.claim.tenant_user_id, propertyId: result.claim.property_id,
    });
    await this.notifications.notify(result.property.landlord_id, 'tenant.portal_activated', 'in_app', {
      message: `${result.property.tenant_name ?? 'A tenant'} activated their student portal for ${result.property.name}.`,
      href: '/landlord/tenants',
      propertyId: result.claim.property_id,
    });
    return { linked: true };
  }

  /** The private record behind one of the landlord's own live bookings,
   * locked so two invitations can't be issued at once. */
  private async ownPrivateTenant(client: PoolClient, landlordId: string, reservationId: string) {
    const tenant = (await client.query<{ id: string; property_id: string }>(
      `SELECT u.id, p.id AS property_id
       FROM reservations r
       JOIN beds b ON b.id = r.bed_id
       JOIN units un ON un.id = b.unit_id
       JOIN properties p ON p.id = un.property_id
       JOIN users u ON u.id = r.student_id
       WHERE r.id = $1 AND p.landlord_id = $2 AND r.status IN ('booked', 'occupied')
         AND u.tenancy_property_id = p.id AND u.logto_user_id IS NULL
       FOR UPDATE OF u`, [reservationId, landlordId],
    )).rows[0];
    if (!tenant) throw new NotFoundException('This tenant already has a portal account, or the booking has ended.');
    return tenant;
  }

  /** Returns the revoked claim's id, or null when none was waiting. */
  private async revokePending(client: PoolClient, tenantUserId: string): Promise<string | null> {
    const revoked = await client.query<{ id: string }>(
      `UPDATE tenancy_claims SET status = 'revoked' WHERE tenant_user_id = $1 AND status = 'pending' RETURNING id`, [tenantUserId],
    );
    return revoked.rows[0]?.id ?? null;
  }
}
