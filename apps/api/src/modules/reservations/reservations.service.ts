import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { desc, eq } from 'drizzle-orm';
import type { Redis } from 'ioredis';

import { RESERVATION_FEE_UGX, type CreateHoldInput } from '@campushomes/shared';

import type { PaymentsAdapter } from '../../adapters/payments.adapter';
import type { RlsContext } from '../../db/rls-context';
import { firstRow } from '../../db/client';
import { RlsDb } from '../../db/db.module';
import { REDIS } from '../../db/redis.module';
import { moveIns, payments, refunds, reservations } from '../../db/schema';
import { AuditService } from '../ops/audit.service';
import { HOLD_EXPIRY_QUEUE, PAYMENTS } from './reservations.tokens';

const HOLD_HOURS = 72;

const SERVICE = (userId: string): RlsContext => ({ userId, role: 'service_role' });

/** Flutterwave `payment_type` → our payment_method enum. */
function toPaymentMethod(
  providerType: string | undefined,
): 'mtn_momo' | 'airtel_money' | 'card' | 'bank_transfer' | null {
  if (!providerType) return null;
  if (providerType === 'card') return 'card';
  if (providerType === 'banktransfer') return 'bank_transfer';
  if (providerType.startsWith('mobilemoney')) return 'mtn_momo';
  return null;
}

/**
 * The reservation state machine (§9 flow 4) — the only write path to
 * reservations/payments/move_ins (RLS: service_role only). Caller identity is
 * verified in-code here because RLS can't do it for service writes.
 */
@Injectable()
export class ReservationsService {
  constructor(
    private readonly rlsDb: RlsDb,
    private readonly audit: AuditService,
    @Inject(PAYMENTS) private readonly paymentsAdapter: PaymentsAdapter,
    @Optional() @Inject(REDIS) private readonly redis: Redis | null,
    @Optional() @Inject(HOLD_EXPIRY_QUEUE) private readonly holdExpiryQueue: Queue | null,
  ) {}

  /** Redis lock (optimization) → DB transaction (guarantee: the partial unique
   * index allows at most one live hold per unit, no matter what). */
  async createHold(ctx: RlsContext, input: CreateHoldInput, redirectUrl: string) {
    const lockKey = `hold-lock:${input.unitId}`;
    const locked = this.redis
      ? await this.redis.set(lockKey, ctx.userId, 'PX', 10_000, 'NX')
      : 'OK';
    if (!locked) {
      throw new ConflictException('Unit is being reserved by someone else — try again');
    }

    try {
      const result = await this.rlsDb.run(SERVICE(ctx.userId), async (db, client) => {
        // Idempotent replay: same client key returns the original hold.
        const existing = await db.query.reservations.findFirst({
          where: eq(reservations.idempotencyKey, input.idempotencyKey),
        });
        if (existing) {
          const [payment] = await db
            .select()
            .from(payments)
            .where(eq(payments.reservationId, existing.id));
          return { reservation: existing, payment, replayed: true as const };
        }

        // Unit must belong to a verified listing.
        const unitRes = await client.query(
          `SELECT u.id, p.phone
           FROM units u
           JOIN listings l ON l.id = u.listing_id AND l.status = 'verified'
           LEFT JOIN users p ON p.id = $2
           WHERE u.id = $1`,
          [input.unitId, ctx.userId],
        );
        if (unitRes.rowCount === 0) {
          throw new NotFoundException('Unit not found on a verified listing');
        }

        const versionRes = await client.query(
          `SELECT l.current_version_id FROM units u
           JOIN listings l ON l.id = u.listing_id WHERE u.id = $1`,
          [input.unitId],
        );
        const listingVersionId = versionRes.rows[0].current_version_id as string;

        // reservations.student_id FKs to students.user_id — a signed-up
        // student who never completed their profile would otherwise hit a
        // raw FK-violation 500 here instead of a clean, actionable error.
        const studentRes = await client.query('SELECT 1 FROM students WHERE user_id = $1', [
          ctx.userId,
        ]);
        if (studentRes.rowCount === 0) {
          throw new ForbiddenException('Complete your student profile before reserving a room');
        }

        const now = new Date();
        const reservation = firstRow(
          await db
            .insert(reservations)
            .values({
              studentId: ctx.userId,
              unitId: input.unitId,
              listingVersionId,
              status: 'held',
              feeAmountUgx: RESERVATION_FEE_UGX,
              holdStartsAt: now,
              holdExpiresAt: new Date(now.getTime() + HOLD_HOURS * 3600_000),
              idempotencyKey: input.idempotencyKey,
            })
            .returning()
            .catch((err: { code?: string; cause?: { code?: string } }) => {
              // The partial unique index — someone else holds this unit now.
              // (drizzle wraps the pg error; the code sits on `cause`.)
              if (err.code === '23505' || err.cause?.code === '23505') {
                throw new ConflictException('Unit already has a live hold');
              }
              throw err;
            }),
        );

        const payment = firstRow(
          await db
            .insert(payments)
            .values({
              reservationId: reservation.id,
              amountUgx: RESERVATION_FEE_UGX,
              // Actual method is chosen on the provider's checkout page; the
              // webhook overwrites this with what the student really used.
              paymentMethod: 'mtn_momo',
            })
            .returning(),
        );

        return {
          reservation,
          payment,
          phone: (unitRes.rows[0].phone as string | null) ?? null,
          replayed: false as const,
        };
      });

      if (result.replayed) {
        return result;
      }

      const { checkoutUrl } = await this.paymentsAdapter.initiate({
        txRef: result.payment.id,
        amountUgx: result.payment.amountUgx,
        phone: result.phone,
        redirectUrl,
      });

      await this.rlsDb.run(SERVICE(ctx.userId), async (db) => {
        await db
          .update(payments)
          .set({ providerRef: result.payment.id })
          .where(eq(payments.id, result.payment.id));
      });

      if (this.holdExpiryQueue) {
        await this.holdExpiryQueue.add(
          'hold_expiry',
          { reservationId: result.reservation.id },
          { delay: HOLD_HOURS * 3600_000, jobId: `hold-expiry-${result.reservation.id}` },
        );
      }

      await this.audit.record(ctx, 'reservation.hold', 'reservation', result.reservation.id, {
        unitId: input.unitId,
        feeUgx: RESERVATION_FEE_UGX,
      });

      return { ...result, checkoutUrl };
    } finally {
      if (this.redis) {
        await this.redis.del(lockKey);
      }
    }
  }

  /** Flutterwave webhook (§9 flow 4). Idempotent on provider_txn_id; if the
   * hold expired before the webhook arrived, auto-refund instead of activating. */
  async applyPaymentWebhook(payload: {
    txRef: string;
    providerTxnId: string;
    status: 'successful' | 'failed';
    paymentMethod?: string;
    raw: Record<string, unknown>;
  }) {
    return this.rlsDb.run(
      SERVICE('00000000-0000-0000-0000-000000000000'),
      async (db) => {
        const payment = await db.query.payments.findFirst({
          where: eq(payments.providerRef, payload.txRef),
        });
        if (!payment) {
          throw new NotFoundException('Unknown tx_ref');
        }
        if (payment.providerTxnId) {
          return { applied: false, reason: 'duplicate webhook' }; // replay — no-op
        }

        const reservation = await db.query.reservations.findFirst({
          where: eq(reservations.id, payment.reservationId),
        });
        if (!reservation) {
          throw new NotFoundException('Reservation missing');
        }

        if (payload.status === 'failed') {
          await db
            .update(payments)
            .set({
              providerTxnId: payload.providerTxnId,
              status: 'failed',
              webhookVerified: true,
              rawWebhook: payload.raw,
              verifiedAt: new Date(),
            })
            .where(eq(payments.id, payment.id));
          await db
            .update(reservations)
            .set({ status: 'payment_failed', updatedAt: new Date() })
            .where(eq(reservations.id, reservation.id));
          return { applied: true, outcome: 'payment_failed' };
        }

        await db
          .update(payments)
          .set({
            providerTxnId: payload.providerTxnId,
            status: 'succeeded',
            webhookVerified: true,
            rawWebhook: payload.raw,
            verifiedAt: new Date(),
            paymentMethod: toPaymentMethod(payload.paymentMethod) ?? payment.paymentMethod,
          })
          .where(eq(payments.id, payment.id));

        const holdExpired =
          reservation.status === 'expired' ||
          (reservation.holdExpiresAt !== null && reservation.holdExpiresAt < new Date());

        if (holdExpired) {
          // Money arrived for a dead hold — refund, never activate (§9 flow 4).
          await db.insert(refunds).values({
            paymentId: payment.id,
            reservationId: reservation.id,
            reason: 'cooling_off',
            amountUgx: payment.amountUgx,
          });
          await db
            .update(reservations)
            .set({ status: 'refunded', updatedAt: new Date() })
            .where(eq(reservations.id, reservation.id));
          return { applied: true, outcome: 'refunded_expired_hold' };
        }

        await db
          .update(reservations)
          .set({ status: 'fulfilled', updatedAt: new Date() })
          .where(eq(reservations.id, reservation.id));
        return { applied: true, outcome: 'fulfilled' };
      },
    );
  }

  /** Student cancels their own hold. Paid-but-unfulfilled edge goes through
   * the same refund path the webhook uses. */
  async cancel(ctx: RlsContext, reservationId: string) {
    const outcome = await this.rlsDb.run(SERVICE(ctx.userId), async (db) => {
      const reservation = await db.query.reservations.findFirst({
        where: eq(reservations.id, reservationId),
      });
      if (!reservation || reservation.studentId !== ctx.userId) {
        throw new NotFoundException('Reservation not found');
      }
      if (!['held', 'payment_pending'].includes(reservation.status)) {
        throw new ConflictException(`Cannot cancel a ${reservation.status} reservation`);
      }
      await db
        .update(reservations)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(reservations.id, reservationId));

      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.reservationId, reservationId));
      if (payment?.status === 'succeeded') {
        await db.insert(refunds).values({
          paymentId: payment.id,
          reservationId,
          reason: 'student_cancel',
          amountUgx: payment.amountUgx,
        });
        return 'cancelled_with_refund';
      }
      return 'cancelled';
    });
    await this.audit.record(ctx, 'reservation.cancel', 'reservation', reservationId, { outcome });
    return { outcome };
  }

  /** Move-in confirmation (§9 flow 5): student or the unit's landlord. */
  async confirmMoveIn(ctx: RlsContext, reservationId: string) {
    const result = await this.rlsDb.run(SERVICE(ctx.userId), async (db, client) => {
      const reservation = await db.query.reservations.findFirst({
        where: eq(reservations.id, reservationId),
      });
      if (!reservation) {
        throw new NotFoundException('Reservation not found');
      }
      if (reservation.status !== 'fulfilled') {
        throw new ConflictException('Only a fulfilled reservation can be moved into');
      }

      let confirmerRole: 'student' | 'landlord';
      if (reservation.studentId === ctx.userId) {
        confirmerRole = 'student';
      } else {
        const landlordRes = await client.query(
          `SELECT 1 FROM units u
           JOIN listings l ON l.id = u.listing_id
           JOIN properties p ON p.id = l.property_id
           WHERE u.id = $1 AND p.landlord_id = $2`,
          [reservation.unitId, ctx.userId],
        );
        if (landlordRes.rowCount === 0) {
          throw new ForbiddenException('Not a party to this reservation');
        }
        confirmerRole = 'landlord';
      }

      const [moveIn] = await db
        .insert(moveIns)
        .values({
          reservationId,
          confirmedAt: new Date(),
          confirmedByRole: confirmerRole,
        })
        .onConflictDoNothing()
        .returning();
      return moveIn ?? { alreadyConfirmed: true };
    });
    await this.audit.record(ctx, 'move_in.confirm', 'reservation', reservationId, {});
    return result;
  }

  /** Student's own reservations — plain RLS read as the caller. */
  mine(ctx: RlsContext) {
    return this.rlsDb.run(ctx, (db) =>
      db.select().from(reservations).orderBy(desc(reservations.createdAt)),
    );
  }

  /** Landlord inbox — RLS exposes reservations on their units, and the
   * payments table is invisible to landlords entirely. */
  landlordInbox(ctx: RlsContext) {
    return this.rlsDb.run(ctx, (db) =>
      db
        .select({
          id: reservations.id,
          unitId: reservations.unitId,
          status: reservations.status,
          holdExpiresAt: reservations.holdExpiresAt,
        })
        .from(reservations)
        .orderBy(desc(reservations.createdAt)),
    );
  }

  paymentStatus(ctx: RlsContext, reservationId: string) {
    return this.rlsDb.run(ctx, async (db) => {
      const [payment] = await db
        .select({ status: payments.status })
        .from(payments)
        .where(eq(payments.reservationId, reservationId));
      if (!payment) {
        throw new NotFoundException('No payment for this reservation');
      }
      return { reservationId, status: payment.status };
    });
  }
}
