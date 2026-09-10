import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { Redis } from 'ioredis';

import type { BookReservationInput, ReleaseReservationInput, ReserveInput } from '@campushomes/shared';

import { loadEnv } from '../../config/env';
import type { RlsContext } from '../../db/rls-context';
import { firstRow, type Db } from '../../db/client';
import { RlsDb } from '../../db/db.module';
import { REDIS } from '../../db/redis.module';
import { moveIns, reservationReleases, reservations } from '../../db/schema';
import { AuditService } from '../ops/audit.service';
import { RESERVATION_EXPIRY_QUEUE } from './reservations.tokens';

const DEFAULT_RESERVE_HOURS = 24;
const MAX_ACTIVE_RESERVATIONS = 3;
// A student already moved in (occupied) can't reserve a new bed until their
// current term is within this many days of ending — reserving a second home
// mid-semester makes no sense; reserving next semester's place as this one
// winds down does.
const REBOOK_WINDOW_DAYS = 21;

const SERVICE = (userId: string): RlsContext => ({ userId, role: 'service_role' });

/**
 * Reserve -> Book -> Move-in (§4-8 of the bed-level redesign doc, 2026-09) —
 * the only write path to reservations/reservation_releases/move_ins (RLS:
 * service_role only). Caller identity is verified in-code here because RLS
 * can't do it for service writes. Booking payment is offline; this service
 * only records what a landlord/custodian reports collecting, it never gates
 * a state transition on it.
 */
@Injectable()
export class ReservationsService {
  private readonly env = loadEnv();

  constructor(
    private readonly rlsDb: RlsDb,
    private readonly audit: AuditService,
    @Optional() @Inject(REDIS) private readonly redis: Redis | null,
    @Optional() @Inject(RESERVATION_EXPIRY_QUEUE) private readonly expiryQueue: Queue | null,
  ) {}

  /** Landlord (own property) or an actively-assigned custodian — the two
   * roles allowed to Book/Release/confirm move-in on a bed. Ops/admin
   * always allowed too (oversight parity with everything else ops touches).
   * Mirrors tenant-agreements.service.ts's assertCanManageProperty. */
  private async assertCanManageProperty(ctx: RlsContext, propertyId: string): Promise<void> {
    if (ctx.role === 'ops_lead' || ctx.role === 'admin') return;
    const allowed = await this.rlsDb.run(SERVICE(ctx.userId), async (_db, client) => {
      if (ctx.role === 'landlord') {
        const res = await client.query('SELECT 1 FROM properties WHERE id = $1 AND landlord_id = $2', [
          propertyId,
          ctx.userId,
        ]);
        return res.rowCount! > 0;
      }
      if (ctx.role === 'custodian') {
        const res = await client.query(
          `SELECT 1 FROM property_memberships
           WHERE property_id = $1 AND user_id = $2 AND role = 'custodian' AND revoked_at IS NULL`,
          [propertyId, ctx.userId],
        );
        return res.rowCount! > 0;
      }
      return false;
    });
    if (!allowed) {
      throw new ForbiddenException("You don't have permission to manage this property's beds");
    }
  }

  /** A student who has already moved into a bed (status 'occupied') can't
   * start a new reservation until that term is within REBOOK_WINDOW_DAYS of
   * ending — otherwise nothing stops someone mid-semester from reserving a
   * second home. Checked against every currently-occupied reservation's own
   * semester end date, not just the newest one. */
  private async assertNotLockedInByCurrentOccupancy(
    client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: { endsOn: string }[] }> },
    studentId: string,
  ): Promise<void> {
    const res = await client.query(
      // ::text — node-pg parses a bare `date` column into a JS Date, whose
      // default toString() is a verbose "Tue Dec 15 2026 00:00:00 GMT+..."
      // in this error message; casting keeps it a plain 'YYYY-MM-DD'.
      `SELECT s.ends_on::text AS "endsOn"
       FROM reservations r
       JOIN listing_versions lv ON lv.id = r.listing_version_id
       JOIN listings l ON l.id = lv.listing_id
       JOIN semesters s ON s.id = l.semester_id
       WHERE r.student_id = $1
         AND r.status = 'occupied'
         AND s.ends_on > (CURRENT_DATE + $2::int * INTERVAL '1 day')
       ORDER BY s.ends_on DESC
       LIMIT 1`,
      [studentId, REBOOK_WINDOW_DAYS],
    );
    const blocking = res.rows[0];
    if (blocking) {
      throw new ConflictException(
        `You're already moved into a bed through ${blocking.endsOn} — you can reserve a new one once that term is within ${REBOOK_WINDOW_DAYS} days of ending.`,
      );
    }
  }

  /** Student selects an available bed and reserves it — a temporary,
   * time-boxed claim (§6), not a completed booking. */
  async reserve(ctx: RlsContext, input: ReserveInput) {
    const lockKey = `reserve-lock:${input.bedId}`;
    const locked = this.redis
      ? await this.redis.set(lockKey, ctx.userId, 'PX', 10_000, 'NX')
      : 'OK';
    if (!locked) {
      throw new ConflictException('Bed is being reserved by someone else — try again');
    }

    try {
      const result = await this.rlsDb.run(SERVICE(ctx.userId), async (db, client) => {
        // Idempotent replay: same client key returns the original reservation.
        const existing = await db.query.reservations.findFirst({
          where: eq(reservations.idempotencyKey, input.idempotencyKey),
        });
        if (existing) {
          return { reservation: existing, replayed: true as const };
        }

        // Bed must belong to the given (verified) listing and not be
        // manually blocked. Rooms are permanent/property-level (2026-09) —
        // a bed alone no longer pins down a single price/semester, since its
        // unit can carry pricing for more than one semester at once — so
        // `listingId` (the listing the student was actually viewing) is what
        // resolves which unit_semester_pricing row applies.
        const bedRes = await client.query(
          `SELECT b.id, l.id AS listing_id,
                  usp.price_per_term_ugx, usp.deposit_ugx
           FROM beds b
           JOIN units u ON u.id = b.unit_id
           JOIN listings l ON l.id = $2 AND l.property_id = u.property_id AND l.status = 'verified'
           JOIN unit_semester_pricing usp ON usp.unit_id = u.id AND usp.semester_id = l.semester_id
           WHERE b.id = $1 AND b.blocked = false`,
          [input.bedId, input.listingId],
        );
        if (bedRes.rowCount === 0) {
          throw new NotFoundException('Bed not found on that verified listing, or it is blocked');
        }
        const listingId = bedRes.rows[0].listing_id as string;
        const priceRow = bedRes.rows[0] as { price_per_term_ugx: number; deposit_ugx: number | null };

        await this.assertNotLockedInByCurrentOccupancy(client, ctx.userId);

        // One active reservation per student, platform-wide (§12-13 of the
        // redesign doc) — active means 'reserved' or 'booked'.
        const activeCountRes = await client.query(
          `SELECT count(*) FROM reservations WHERE student_id = $1 AND status IN ('reserved', 'booked')`,
          [ctx.userId],
        );
        if (Number(activeCountRes.rows[0].count) >= MAX_ACTIVE_RESERVATIONS) {
          throw new ConflictException(
            `You already have ${MAX_ACTIVE_RESERVATIONS} active reservations — cancel or complete one before reserving another.`,
          );
        }

        // reservations.student_id FKs to students.user_id — a signed-up
        // student who never completed their profile would otherwise hit a
        // raw FK-violation 500 here instead of a clean, actionable error.
        const studentRes = await client.query('SELECT 1 FROM students WHERE user_id = $1', [
          ctx.userId,
        ]);
        if (studentRes.rowCount === 0) {
          throw new ForbiddenException('Complete your student profile before reserving a bed');
        }

        // The listing_version snapshot active at reserve time.
        const versionRes = await client.query('SELECT current_version_id FROM listings WHERE id = $1', [
          listingId,
        ]);
        const listingVersionId = versionRes.rows[0].current_version_id as string;

        const policyRes = await client.query<{ value: unknown }>(
          `SELECT value FROM platform_settings WHERE key = 'reservation_hold_hours'`,
        );
        const configuredHours = Number(policyRes.rows[0]?.value);
        const holdHours = Number.isFinite(configuredHours) ? configuredHours : DEFAULT_RESERVE_HOURS;

        const now = new Date();
        const reservation = firstRow(
          await db
            .insert(reservations)
            .values({
              studentId: ctx.userId,
              bedId: input.bedId,
              listingVersionId,
              status: 'reserved',
              reservedAt: now,
              reservedExpiresAt: new Date(now.getTime() + holdHours * 3600_000),
              idempotencyKey: input.idempotencyKey,
              // Snapshot now — rooms are reusable/repriceable across
              // semesters (2026-09), so this can never be read live off the
              // unit again without risking a later price change silently
              // rewriting what this student actually agreed to.
              pricePerTermUgx: Number(priceRow.price_per_term_ugx),
              depositUgx: priceRow.deposit_ugx != null ? Number(priceRow.deposit_ugx) : null,
            })
            .returning()
            .catch((err: { code?: string; cause?: { code?: string } }) => {
              // The partial unique index — someone else has a live claim on this bed.
              if (err.code === '23505' || err.cause?.code === '23505') {
                throw new ConflictException('Bed already has a live reservation');
              }
              throw err;
            }),
        );

        return { reservation, holdHours, replayed: false as const };
      });

      if (result.replayed) {
        return result.reservation;
      }

      await this.audit.record(ctx, 'reservation.reserve', 'reservation', result.reservation.id, {
        bedId: input.bedId,
      });

      if (this.expiryQueue) {
        await this.expiryQueue.add(
          'reservation_expiry',
          { reservationId: result.reservation.id },
          { delay: result.holdHours * 3600_000, jobId: `reservation-expiry-${result.reservation.id}` },
        );
      }

      return result.reservation;
    } finally {
      if (this.redis) {
        await this.redis.del(lockKey);
      }
    }
  }

  /** Landlord/custodian confirms a booking (§7) — either against an
   * existing Reserved row, or directly against an Available bed with no
   * prior Reserve step at all (the walk-in path, identified by the
   * student's phone). Booking payment is offline; this just records what
   * was reported collected. */
  async book(ctx: RlsContext, input: BookReservationInput) {
    const result = await this.rlsDb.run(SERVICE(ctx.userId), async (db, client) => {
      let bedId: string;
      let propertyId: string;
      let existingReservationId: string | null = null;
      let studentId: string;
      let listingVersionId: string;
      let walkInPrice: { price_per_term_ugx: number; deposit_ugx: number | null } | null = null;

      if (input.reservationId) {
        const reservation = await db.query.reservations.findFirst({
          where: eq(reservations.id, input.reservationId),
        });
        if (!reservation) throw new NotFoundException('Reservation not found');
        if (reservation.status !== 'reserved') {
          throw new ConflictException(`Cannot book a reservation that is ${reservation.status}`);
        }
        const bedRes = await client.query(
          `SELECT u.property_id FROM beds b
           JOIN units u ON u.id = b.unit_id
           WHERE b.id = $1`,
          [reservation.bedId],
        );
        bedId = reservation.bedId;
        propertyId = bedRes.rows[0].property_id as string;
        existingReservationId = reservation.id;
        studentId = reservation.studentId;
        listingVersionId = reservation.listingVersionId;
      } else {
        // Walk-in: book an Available bed directly, no prior Reserve. Rooms
        // are permanent/property-level (2026-09) — a unit can carry pricing
        // for more than one semester, so this picks whichever verified
        // listing was most recently published for the bed's property (same
        // "prefer the current listing" precedent as ListingsService.
        // propertyDetail, the landlord's own view this walk-in flow is
        // driven from).
        const bedRes = await client.query(
          `SELECT b.id, u.property_id, l.id AS listing_id, l.current_version_id,
                  usp.price_per_term_ugx, usp.deposit_ugx
           FROM beds b
           JOIN units u ON u.id = b.unit_id
           JOIN listings l ON l.property_id = u.property_id AND l.status = 'verified'
           JOIN unit_semester_pricing usp ON usp.unit_id = u.id AND usp.semester_id = l.semester_id
           WHERE b.id = $1 AND b.blocked = false
           ORDER BY l.created_at DESC
           LIMIT 1`,
          [input.bedId],
        );
        if (bedRes.rowCount === 0) {
          throw new NotFoundException('Bed not found on a verified listing, or it is blocked');
        }
        bedId = bedRes.rows[0].id as string;
        propertyId = bedRes.rows[0].property_id as string;
        listingVersionId = bedRes.rows[0].current_version_id as string;
        walkInPrice = bedRes.rows[0] as { price_per_term_ugx: number; deposit_ugx: number | null };

        const studentRes = await client.query(
          `SELECT s.user_id FROM students s JOIN users u ON u.id = s.user_id WHERE u.phone = $1`,
          [input.studentPhone],
        );
        if (studentRes.rowCount === 0) {
          throw new NotFoundException(
            'No student account with a completed profile found for that phone number',
          );
        }
        studentId = studentRes.rows[0].user_id as string;

        await this.assertNotLockedInByCurrentOccupancy(client, studentId);

        // Walk-in creates a brand-new active reservation for this student —
        // the same platform-wide cap reserve() enforces (§12-13), or a
        // landlord could Book past it for a student who's already at 3.
        const activeCountRes = await client.query(
          `SELECT count(*) FROM reservations WHERE student_id = $1 AND status IN ('reserved', 'booked')`,
          [studentId],
        );
        if (Number(activeCountRes.rows[0].count) >= MAX_ACTIVE_RESERVATIONS) {
          throw new ConflictException(
            `This student already has ${MAX_ACTIVE_RESERVATIONS} active reservations — release or complete one before booking another.`,
          );
        }
      }

      await this.assertCanManageProperty(ctx, propertyId);

      const now = new Date();
      let reservationRow;
      if (existingReservationId) {
        await db
          .update(reservations)
          .set({
            status: 'booked',
            bookedAt: now,
            bookedBy: ctx.userId,
            reservedExpiresAt: null,
            bookingFeeCollectedUgx: input.bookingFeeCollectedUgx ?? null,
            depositCollectedUgx: input.depositCollectedUgx ?? null,
            paymentMethod: input.paymentMethod ?? null,
            paymentRecordedAt: input.bookingFeeCollectedUgx || input.depositCollectedUgx ? now : null,
            updatedAt: now,
          })
          .where(eq(reservations.id, existingReservationId));
        reservationRow = await this.selectById(db, existingReservationId);
      } else {
        const inserted = firstRow(
          await db
            .insert(reservations)
            .values({
              studentId,
              bedId,
              listingVersionId,
              status: 'booked',
              bookedAt: now,
              bookedBy: ctx.userId,
              bookingFeeCollectedUgx: input.bookingFeeCollectedUgx ?? null,
              depositCollectedUgx: input.depositCollectedUgx ?? null,
              paymentMethod: input.paymentMethod ?? null,
              paymentRecordedAt: input.bookingFeeCollectedUgx || input.depositCollectedUgx ? now : null,
              idempotencyKey: `walkin-${bedId}-${now.getTime()}`,
              pricePerTermUgx: Number(walkInPrice!.price_per_term_ugx),
              depositUgx: walkInPrice!.deposit_ugx != null ? Number(walkInPrice!.deposit_ugx) : null,
            })
            .returning()
            .catch((err: { code?: string; cause?: { code?: string } }) => {
              if (err.code === '23505' || err.cause?.code === '23505') {
                throw new ConflictException('Bed already has a live reservation');
              }
              throw err;
            }),
        );
        reservationRow = inserted;
      }
      return reservationRow;
    });

    await this.audit.record(ctx, 'reservation.book', 'reservation', result!.id, {
      bedId: result!.bedId,
      walkIn: !input.reservationId,
    });
    return result;
  }

  /** Landlord/custodian/ops frees up a Reserved or Booked bed the student
   * didn't end up taking (§15-16). Always recorded with a reason — money
   * may already have changed hands offline for a Booked bed. */
  async release(ctx: RlsContext, reservationId: string, input: ReleaseReservationInput) {
    const result = await this.rlsDb.run(SERVICE(ctx.userId), async (db, client) => {
      const reservation = await db.query.reservations.findFirst({
        where: eq(reservations.id, reservationId),
      });
      if (!reservation) throw new NotFoundException('Reservation not found');
      if (!['reserved', 'booked'].includes(reservation.status)) {
        throw new ConflictException(`Cannot release a reservation that is ${reservation.status}`);
      }

      const bedRes = await client.query(
        `SELECT u.property_id FROM beds b
         JOIN units u ON u.id = b.unit_id
         WHERE b.id = $1`,
        [reservation.bedId],
      );
      await this.assertCanManageProperty(ctx, bedRes.rows[0].property_id as string);

      await db
        .update(reservations)
        .set({ status: 'released', updatedAt: new Date() })
        .where(eq(reservations.id, reservationId));

      const hadMoneyCollected = Boolean(
        reservation.bookingFeeCollectedUgx || reservation.depositCollectedUgx,
      );
      await db.insert(reservationReleases).values({
        reservationId,
        releasedBy: ctx.userId,
        reason: input.reason,
        refundRequired: input.refundRequired ?? hadMoneyCollected,
        notes: input.notes ?? null,
      });

      return { outcome: 'released' as const };
    });

    await this.audit.record(ctx, 'reservation.release', 'reservation', reservationId, {
      reason: input.reason,
    });
    return result;
  }

  /** Student cancels their own Reserved bed — only while still Reserved.
   * Once a landlord has Booked it (and possibly collected money offline),
   * only the landlord's own Release can free it back up. */
  async cancel(ctx: RlsContext, reservationId: string) {
    const outcome = await this.rlsDb.run(SERVICE(ctx.userId), async (db) => {
      const reservation = await db.query.reservations.findFirst({
        where: eq(reservations.id, reservationId),
      });
      if (!reservation || reservation.studentId !== ctx.userId) {
        throw new NotFoundException('Reservation not found');
      }
      if (reservation.status !== 'reserved') {
        throw new ConflictException(`Cannot cancel a reservation that is ${reservation.status}`);
      }
      await db
        .update(reservations)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(reservations.id, reservationId));
      return 'cancelled';
    });
    await this.audit.record(ctx, 'reservation.cancel', 'reservation', reservationId, { outcome });
    return { outcome };
  }

  /** Move-in confirmation (§8): student or the bed's landlord/custodian.
   * Only a Booked reservation can move in. */
  async confirmMoveIn(ctx: RlsContext, reservationId: string) {
    const result = await this.rlsDb.run(SERVICE(ctx.userId), async (db, client) => {
      const reservation = await db.query.reservations.findFirst({
        where: eq(reservations.id, reservationId),
      });
      if (!reservation) {
        throw new NotFoundException('Reservation not found');
      }
      if (reservation.status !== 'booked') {
        throw new ConflictException('Only a booked reservation can be moved into');
      }

      let confirmerRole: 'student' | 'landlord';
      if (reservation.studentId === ctx.userId) {
        confirmerRole = 'student';
      } else {
        const bedRes = await client.query(
          `SELECT u.property_id FROM beds b
           JOIN units u ON u.id = b.unit_id
           WHERE b.id = $1`,
          [reservation.bedId],
        );
        await this.assertCanManageProperty(ctx, bedRes.rows[0].property_id as string);
        confirmerRole = 'landlord';
      }

      const [moveIn] = await db
        .insert(moveIns)
        .values({ reservationId, confirmedAt: new Date(), confirmedByRole: confirmerRole })
        .onConflictDoNothing()
        .returning();

      // Occupied is a first-class reservation status now (§9.4), not just
      // inferred from a move_ins row existing.
      await db
        .update(reservations)
        .set({ status: 'occupied', updatedAt: new Date() })
        .where(eq(reservations.id, reservationId));

      return moveIn ?? { alreadyConfirmed: true };
    });
    await this.audit.record(ctx, 'move_in.confirm', 'reservation', reservationId, {});
    return result;
  }

  /** Student's own reservations, joined with enough of the bed/unit/property
   * to tell one card apart from another in the list — `properties` has no
   * public/self-student SELECT policy (owner+ops only), so this runs under
   * service_role with the student scope enforced in code via the WHERE
   * clause instead of RLS. */
  mine(ctx: RlsContext) {
    return this.rlsDb.run(SERVICE(ctx.userId), async (_db, client) => {
      const res = await client.query(
        `SELECT
           r.id, r.student_id AS "studentId", r.bed_id AS "bedId",
           r.listing_version_id AS "listingVersionId", r.status,
           r.reserved_expires_at AS "reservedExpiresAt", r.booked_at AS "bookedAt",
           r.booking_fee_collected_ugx AS "bookingFeeCollectedUgx",
           r.deposit_collected_ugx AS "depositCollectedUgx", r.payment_method AS "paymentMethod",
           l.id AS "listingId", p.name AS "propertyName", p.street_address AS "propertyStreetAddress",
           b.label AS "bedLabel", u.room_category AS "roomCategory", u.capacity AS "roomCapacity",
           r.price_per_term_ugx AS "rentPerTermUgx", r.deposit_ugx AS "depositUgx"
         FROM reservations r
         JOIN beds b ON b.id = r.bed_id
         JOIN units u ON u.id = b.unit_id
         JOIN listing_versions lv ON lv.id = r.listing_version_id
         JOIN listings l ON l.id = lv.listing_id
         JOIN properties p ON p.id = l.property_id
         WHERE r.student_id = $1
         ORDER BY r.created_at DESC`,
        [ctx.userId],
      );
      return res.rows;
    });
  }

  /** Landlord inbox — RLS exposes reservations on their beds via
   * reservations_landlord_read; payments detail was never landlord-visible
   * and there's nothing left to hide (booking info is theirs, they entered it). */
  landlordInbox(ctx: RlsContext) {
    return this.rlsDb.run(ctx, async (db, client) => {
      const res = await client.query(
        `SELECT
           r.id, r.bed_id AS "bedId", r.status, r.reserved_expires_at AS "reservedExpiresAt",
           r.booked_at AS "bookedAt", r.booking_fee_collected_ugx AS "bookingFeeCollectedUgx",
           r.deposit_collected_ugx AS "depositCollectedUgx", r.payment_method AS "paymentMethod",
           r.created_at AS "createdAt", b.label AS "bedLabel", m.confirmed_at AS "moveInConfirmedAt"
         FROM reservations r
         JOIN beds b ON b.id = r.bed_id
         LEFT JOIN move_ins m ON m.reservation_id = r.id
         ORDER BY r.created_at DESC`,
      );
      return res.rows;
    });
  }

  private selectById(db: Db, id: string) {
    return db.query.reservations.findFirst({ where: eq(reservations.id, id) });
  }
}
