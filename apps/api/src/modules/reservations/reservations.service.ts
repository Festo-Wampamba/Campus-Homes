import {
  BadRequestException,
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
import type { PoolClient } from 'pg';

import { MAX_ACTIVE_RESERVATIONS, type BookReservationInput, type OnboardWalkInInput, type RecordPaymentInput, type ReleaseReservationInput, type ReserveInput } from '@campushomes/shared';

import { loadEnv } from '../../config/env';
import type { RlsContext } from '../../db/rls-context';
import { firstRow, type Db } from '../../db/client';
import { RlsDb } from '../../db/db.module';
import { REDIS } from '../../db/redis.module';
import { assertStaffScope } from '../auth/staff-scope';
import { moveIns, reservationReleases, reservations } from '../../db/schema';
import { AuditService } from '../ops/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { sendPaymentReceiptEmail } from './payment-receipt-email';
import { sendWalkInWelcomeEmail } from './walk-in-email';
import type { TenantExportRow } from './tenants-export';
import { EXPIRE_OVERDUE_HOLDS_SQL, RESERVATION_EXPIRY_QUEUE } from './reservations.tokens';

export const DEFAULT_RESERVE_HOURS = 6;

type ReceiptRow = {
  receipt_number: string;
  student_id: string;
  landlord_id: string;
  property_name: string;
  room_label: string;
  booking_fee_ugx: number;
  deposit_ugx: number;
  rent_ugx: number;
  payment_method: string | null;
  recorded_at: Date;
};

const RECEIPT_RETURNING = `RETURNING receipt_number, student_id, landlord_id, property_name, room_label,
  booking_fee_ugx, deposit_ugx, rent_ugx, payment_method::text AS payment_method, recorded_at`;
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
    // Explicit token: a `| null` union emits no usable type metadata for DI.
    @Optional() @Inject(NotificationsService) private readonly notifications: NotificationsService | null = null,
  ) {}

  /** Landlord (own property) or an actively-assigned custodian — the two
   * roles allowed to Book/Release/confirm move-in on a bed. Ops/admin
   * must have an active staff assignment covering the target property.
   * Mirrors tenant-agreements.service.ts's assertCanManageProperty. */
  private async assertCanManageProperty(client: PoolClient, ctx: RlsContext, propertyId: string): Promise<void> {
    if (ctx.role === 'ops_lead' || ctx.role === 'admin') {
      await assertStaffScope(client, ctx, propertyId);
      return;
    }
    let allowed = false;
    if (ctx.role === 'landlord') {
      const res = await client.query('SELECT 1 FROM properties WHERE id = $1 AND landlord_id = $2', [
        propertyId,
        ctx.userId,
      ]);
      allowed = res.rowCount! > 0;
    } else if (ctx.role === 'custodian') {
      const res = await client.query(
        `SELECT 1 FROM property_memberships
         WHERE property_id = $1 AND user_id = $2 AND role = 'custodian' AND revoked_at IS NULL
           AND status = 'active' AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())`,
        [propertyId, ctx.userId],
      );
      allowed = res.rowCount! > 0;
    }
    if (!allowed) {
      throw new ForbiddenException("You don't have permission to manage this property's beds");
    }
  }

  /** Runs the property-management check on the caller's already-open client
   * (never a second rlsDb.run — that would need a second pooled connection
   * per call and deadlock the pool under load) against the property that owns
   * `bedId`, before any student/status/limit lookup can leak to the caller. */
  private async assertCanManageBed(client: PoolClient, ctx: RlsContext, bedId: string): Promise<void> {
    const res = await client.query('SELECT u.property_id FROM beds b JOIN units u ON u.id = b.unit_id WHERE b.id = $1', [
      bedId,
    ]);
    if (res.rowCount === 0) throw new NotFoundException('Bed not found');
    await this.assertCanManageProperty(client, ctx, res.rows[0].property_id as string);
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
        `You're already moved into a bed through ${blocking.endsOn}. You can reserve a new one once that term is within ${REBOOK_WINDOW_DAYS} days of ending.`,
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
      throw new ConflictException('Bed is being reserved by someone else. Try again');
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

        // Release overdue holds before checking this bed and this student's
        // limit, so neither depends on the expiry job having already run.
        await client.query(EXPIRE_OVERDUE_HOLDS_SQL);

        await this.assertStudentCanTakeRoom(client, ctx.userId, input.bedId, 'student');

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
    let receipt: ReceiptRow | null = null;
    const result = await this.rlsDb.run(SERVICE(ctx.userId), async (db, client) => {
      let bedId: string;
      let existingReservationId: string | null = null;
      let studentId: string;
      let listingVersionId: string;
      let walkInPrice: { price_per_term_ugx: number; deposit_ugx: number | null } | null = null;

      if (input.reservationId) {
        const reservation = await db.query.reservations.findFirst({
          where: eq(reservations.id, input.reservationId),
        });
        if (!reservation) throw new NotFoundException('Reservation not found');
        await this.assertCanManageBed(client, ctx, reservation.bedId);
        if (reservation.status !== 'reserved') {
          throw new ConflictException(`Cannot book a reservation that is ${reservation.status}`);
        }
        bedId = reservation.bedId;
        existingReservationId = reservation.id;
        studentId = reservation.studentId;
        listingVersionId = reservation.listingVersionId;
      } else {
        // The schema guarantees bedId here; this only narrows the type.
        if (!input.bedId) throw new NotFoundException('Bed not found');
        await this.assertCanManageBed(client, ctx, input.bedId);
        // Walk-in: book an Available bed directly, no prior Reserve. Rooms
        // are permanent/property-level (2026-09) — a unit can carry pricing
        // for more than one semester, so this picks whichever verified
        // listing was most recently published for the bed's property (same
        // "prefer the current listing" precedent as ListingsService.
        // propertyDetail, the landlord's own view this walk-in flow is
        // driven from).
        const bedRes = await client.query(
          `SELECT b.id, l.id AS listing_id, l.current_version_id,
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
        listingVersionId = bedRes.rows[0].current_version_id as string;
        walkInPrice = bedRes.rows[0] as { price_per_term_ugx: number; deposit_ugx: number | null };
        const recorded = (input.bookingFeeCollectedUgx ?? 0) + (input.depositCollectedUgx ?? 0);
        if (recorded > Number(walkInPrice.price_per_term_ugx)) {
          throw new BadRequestException(
            `Amount paid is more than this room's rent (UGX ${Number(walkInPrice.price_per_term_ugx).toLocaleString('en-UG')})`,
          );
        }

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

        // Walk-in creates a brand-new active reservation for this student, so
        // the same per-student rules as reserve() apply (§12-13).
        await this.assertStudentCanTakeRoom(client, studentId, bedId, 'landlord');
      }

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
      // Money recorded at booking gets a receipt both sides keep (0075).
      const bookingFee = input.bookingFeeCollectedUgx ?? 0;
      const deposit = input.depositCollectedUgx ?? 0;
      if (bookingFee + deposit > 0) {
        receipt = (await client.query<ReceiptRow>(
          `INSERT INTO payment_receipts (reservation_id, student_id, landlord_id, property_name, room_label,
             booking_fee_ugx, deposit_ugx, payment_method, recorded_by)
           SELECT $1, $2, p.landlord_id, p.name, u.label, $3, $4, $5, $6
           FROM beds b JOIN units u ON u.id = b.unit_id JOIN properties p ON p.id = u.property_id
           WHERE b.id = $7
           ${RECEIPT_RETURNING}`,
          [reservationRow!.id, studentId, bookingFee, deposit, input.paymentMethod ?? null, ctx.userId, bedId],
        )).rows[0] ?? null;
      }
      return reservationRow;
    });
    if (receipt) this.deliverReceipt(receipt);

    await this.audit.record(ctx, 'reservation.book', 'reservation', result!.id, {
      bedId: result!.bedId,
      walkIn: !input.reservationId,
    });
    // The student's booking tracker moves to "Landlord confirmed"; tell them.
    this.notifications
      ?.notify(result!.studentId, 'reservation.booked', 'in_app', {
        reservationId: result!.id,
        message: 'Your landlord confirmed your booking. Move in and confirm it in My reservations.',
        href: '/reservations',
      })
      .catch((err: unknown) => console.error('[reservations] booking confirmed notify failed:', err));
    return result;
  }

  /** Emails the receipt to the student and the landlord and leaves each an
   * in-app notice. Best-effort and after commit: the row is the record. */
  private deliverReceipt(receipt: ReceiptRow) {
    void this.rlsDb.run(SERVICE(receipt.landlord_id), async (_db, client) =>
      (await client.query<{ id: string; email: string | null; name: string | null }>(
        `SELECT id, email, NULLIF(btrim(name), '') AS name FROM users WHERE id = ANY($1::uuid[])`,
        [[receipt.student_id, receipt.landlord_id]],
      )).rows)
      .then(async (people) => {
        const student = people.find((p) => p.id === receipt.student_id);
        const landlord = people.find((p) => p.id === receipt.landlord_id);
        const total = receipt.booking_fee_ugx + receipt.deposit_ugx + receipt.rent_ugx;
        const summary = `UGX ${total.toLocaleString('en-UG')} for ${receipt.room_label} at ${receipt.property_name} (receipt ${receipt.receipt_number})`;
        const base = {
          receiptNumber: receipt.receipt_number,
          studentName: student?.name ?? 'Student',
          propertyName: receipt.property_name,
          roomLabel: receipt.room_label,
          bookingFeeUgx: receipt.booking_fee_ugx,
          depositUgx: receipt.deposit_ugx,
          rentUgx: receipt.rent_ugx,
          paymentMethod: receipt.payment_method,
          recordedAt: receipt.recorded_at,
        };
        const env = loadEnv();
        await Promise.all([
          student?.email ? sendPaymentReceiptEmail(env, { ...base, to: student.email, audience: 'student' }) : null,
          landlord?.email ? sendPaymentReceiptEmail(env, { ...base, to: landlord.email, audience: 'landlord' }) : null,
          this.notifications?.notify(receipt.student_id, 'payment.receipt', 'in_app', {
            message: `Payment recorded: ${summary}.`, href: '/reservations',
          }),
          this.notifications?.notify(receipt.landlord_id, 'payment.receipt', 'in_app', {
            message: `You recorded ${summary} from ${base.studentName}.`, href: '/landlord/payments',
          }),
        ]);
      })
      .catch((err: unknown) => console.error('[reservations] receipt delivery failed:', err instanceof Error ? err.message : err));
  }

  /** Receipts for the signed-in student or landlord, newest first. */
  receipts(ctx: RlsContext, side: 'student' | 'landlord') {
    const party = side === 'student' ? 'r.student_id' : 'r.landlord_id';
    return this.rlsDb.run(SERVICE(ctx.userId), async (_db, client) =>
      (await client.query(
        `SELECT r.id, r.receipt_number AS "receiptNumber", r.reservation_id AS "reservationId",
                r.property_name AS "propertyName", r.room_label AS "roomLabel",
                NULLIF(btrim(u.name), '') AS "studentName",
                r.booking_fee_ugx AS "bookingFeeUgx", r.deposit_ugx AS "depositUgx", r.rent_ugx AS "rentUgx",
                r.booking_fee_ugx + r.deposit_ugx + r.rent_ugx AS "totalUgx",
                r.payment_method::text AS "paymentMethod", r.recorded_at AS "recordedAt"
         FROM payment_receipts r JOIN users u ON u.id = r.student_id
         WHERE ${party} = $1
         ORDER BY r.recorded_at DESC LIMIT 500`,
        [ctx.userId],
      )).rows,
    );
  }

  /** The landlord's booked and moved-in students with contact details and
   * money: Total is the rent stored at booking, Paid adds up the receipts.
   * Same student fields as studentDetails(); scoped to the landlord's own
   * properties in the WHERE clause, since it runs as service_role. */
  landlordTenants(ctx: RlsContext) {
    return this.rlsDb.run(SERVICE(ctx.userId), async (_db, client) => {
      const tenants = (await client.query<Omit<TenantExportRow, 'paidUgx' | 'balanceUgx'> & { reservationId: string }>(
        `SELECT r.id AS "reservationId", r.bed_id AS "bedId", r.status::text AS status,
                p.id AS "propertyId", p.name AS "propertyName", un.id AS "unitId", un.label AS "roomLabel",
                b.label AS "bedLabel", NULLIF(btrim(u.name), '') AS name,
                COALESCE(u.phone, u.contact_phone) AS phone, u.email,
                u.emergency_contact_name AS "emergencyContactName",
                u.emergency_contact_phone AS "emergencyContactPhone",
                r.price_per_term_ugx AS "totalUgx"
         FROM reservations r
         JOIN beds b ON b.id = r.bed_id
         JOIN units un ON un.id = b.unit_id
         JOIN properties p ON p.id = un.property_id
         JOIN users u ON u.id = r.student_id
         WHERE p.landlord_id = $1 AND r.status IN ('booked', 'occupied')
         ORDER BY p.name, un.label, b.label`,
        [ctx.userId],
      )).rows;
      const paid = await this.paidByReservation(client, tenants.map((t) => t.reservationId));
      return tenants.map((t) => {
        const paidUgx = paid.get(t.reservationId) ?? 0;
        return { ...t, paidUgx, balanceUgx: Number(t.totalUgx) - paidUgx };
      });
    });
  }

  /** A later payment on a live booking (0078): one receipt per instalment,
   * never more than the remaining balance. */
  async recordPayment(ctx: RlsContext, reservationId: string, input: RecordPaymentInput) {
    let receipt: ReceiptRow | null = null;
    let replayed = false;
    await this.rlsDb.run(SERVICE(ctx.userId), async (_db, client) => {
      // FOR UPDATE: two payments recorded at once can't both fit one balance,
      // and a retry waits here until the first attempt's receipt is visible.
      const reservation = (await client.query<{ bed_id: string; student_id: string; status: string; total: number }>(
        `SELECT bed_id, student_id, status::text AS status, price_per_term_ugx AS total
         FROM reservations WHERE id = $1 FOR UPDATE`,
        [reservationId],
      )).rows[0];
      if (!reservation) throw new NotFoundException('Reservation not found');
      await this.assertCanManageBed(client, ctx, reservation.bed_id);
      const earlier = (await client.query<ReceiptRow>(
        `SELECT receipt_number, student_id, landlord_id, property_name, room_label, booking_fee_ugx, deposit_ugx,
                rent_ugx, payment_method::text AS payment_method, recorded_at
         FROM payment_receipts WHERE reservation_id = $1 AND idempotency_key = $2`,
        [reservationId, input.idempotencyKey],
      )).rows[0];
      if (earlier) {
        // Same key with different details isn't a retry: the landlord changed
        // the payment after the first one saved, so say so instead of
        // reporting the edited payment as recorded.
        if (earlier.rent_ugx !== input.amountUgx || earlier.payment_method !== (input.paymentMethod ?? null)) {
          throw new ConflictException(
            `This payment was already recorded as UGX ${earlier.rent_ugx.toLocaleString('en-UG')} (receipt ${earlier.receipt_number}). Close this window and record any other payment separately.`,
          );
        }
        receipt = earlier;
        replayed = true;
        return;
      }
      if (reservation.status !== 'booked' && reservation.status !== 'occupied') {
        throw new ConflictException('Payments can only be recorded for a booked or moved-in student');
      }
      const balance = Number(reservation.total) - ((await this.paidByReservation(client, [reservationId])).get(reservationId) ?? 0);
      if (input.amountUgx > balance) {
        throw new BadRequestException(`That is more than the balance of UGX ${Math.max(balance, 0).toLocaleString('en-UG')}`);
      }
      receipt = (await client.query<ReceiptRow>(
        `INSERT INTO payment_receipts (reservation_id, student_id, landlord_id, property_name, room_label,
           rent_ugx, payment_method, recorded_by, idempotency_key)
         SELECT $1, $2, p.landlord_id, p.name, u.label, $3, $4, $5, $7
         FROM beds b JOIN units u ON u.id = b.unit_id JOIN properties p ON p.id = u.property_id
         WHERE b.id = $6
         ${RECEIPT_RETURNING}`,
        [reservationId, reservation.student_id, input.amountUgx, input.paymentMethod ?? null, ctx.userId, reservation.bed_id, input.idempotencyKey],
      )).rows[0] ?? null;
    });
    const recorded = receipt as ReceiptRow | null;
    if (!recorded) throw new NotFoundException('Bed not found');
    // A replay already emailed and audited the first time.
    if (replayed) return { receiptNumber: recorded.receipt_number, amountUgx: recorded.rent_ugx };
    this.deliverReceipt(recorded);
    await this.audit.record(ctx, 'reservation.payment_record', 'reservation', reservationId, {
      amountUgx: input.amountUgx,
      receiptNumber: recorded.receipt_number,
    });
    return { receiptNumber: recorded.receipt_number, amountUgx: input.amountUgx };
  }

  /** Money recorded per booking: every receipt. A booking recorded before
   * receipts existed (pre-0075) has no booking-fee/deposit receipt, so its
   * booking-row amounts count too, alongside any later rent receipts. */
  private async paidByReservation(client: PoolClient, reservationIds: string[]): Promise<Map<string, number>> {
    if (reservationIds.length === 0) return new Map();
    const rows = (await client.query<{ id: string; paid: string }>(
      `SELECT r.id,
              (COALESCE(pr.paid, 0)
                + CASE WHEN COALESCE(pr.has_booking_receipt, false) THEN 0
                       ELSE COALESCE(r.booking_fee_collected_ugx, 0) + COALESCE(r.deposit_collected_ugx, 0) END)::text AS paid
       FROM reservations r
       LEFT JOIN (
         SELECT reservation_id, SUM(booking_fee_ugx + deposit_ugx + rent_ugx) AS paid,
                bool_or(booking_fee_ugx + deposit_ugx > 0) AS has_booking_receipt
         FROM payment_receipts WHERE reservation_id = ANY($1::uuid[]) GROUP BY reservation_id
       ) pr ON pr.reservation_id = r.id
       WHERE r.id = ANY($1::uuid[])`,
      [reservationIds],
    )).rows;
    return new Map(rows.map((row) => [row.id, Number(row.paid)]));
  }

  /** What a bed's landlord (or custodian/ops) may see about its student:
   * contact and emergency details for running the booking, only while it is
   * live. Date of birth, nationality and home address stay with the student. */
  async studentDetails(ctx: RlsContext, reservationId: string) {
    return this.rlsDb.run(SERVICE(ctx.userId), async (_db, client) => {
      const reservation = (await client.query<{ bed_id: string; student_id: string; status: string }>(
        `SELECT bed_id, student_id, status::text AS status FROM reservations WHERE id = $1`, [reservationId],
      )).rows[0];
      if (!reservation) throw new NotFoundException('Reservation not found');
      await this.assertCanManageBed(client, ctx, reservation.bed_id);
      if (!['reserved', 'booked', 'occupied'].includes(reservation.status)) {
        throw new ForbiddenException('Student details are only available while the reservation or booking is active');
      }
      return (await client.query(
        `SELECT NULLIF(btrim(u.name), '') AS name, COALESCE(u.phone, u.contact_phone) AS phone, u.email,
                s.university::text AS university, s.year_of_study AS "yearOfStudy", u.gender,
                u.emergency_contact_name AS "emergencyContactName", u.emergency_contact_phone AS "emergencyContactPhone",
                u.logto_user_id IS NOT NULL AS "hasSignedIn"
         FROM users u LEFT JOIN students s ON s.user_id = u.id WHERE u.id = $1`,
        [reservation.student_id],
      )).rows[0];
    });
  }

  /** A student who walked in without CampusHomes (Festo, 2026-10-23): find
   * their student account by phone or create one, then book() the bed like any
   * walk-in. They claim the account when they first sign in with this phone
   * (ProvisioningService links by verified phone). The account is committed
   * before the booking, so a failed booking can leave an account with no room;
   * the bed checks run first to keep that rare. */
  async onboardWalkIn(ctx: RlsContext, input: OnboardWalkInInput) {
    const account = await this.rlsDb.run(SERVICE(ctx.userId), async (_db, client) => {
      await this.assertCanManageBed(client, ctx, input.bedId);
      const property = (await client.query<{ name: string; room_label: string }>(
        `SELECT p.name, u.label AS room_label FROM beds b JOIN units u ON u.id = b.unit_id JOIN properties p ON p.id = u.property_id WHERE b.id = $1`,
        [input.bedId],
      )).rows[0];
      const existing = (await client.query<{ id: string; role: string; has_profile: boolean }>(
        `SELECT u.id, u.role::text AS role, EXISTS (SELECT 1 FROM students s WHERE s.user_id = u.id) AS has_profile
         FROM users u WHERE u.phone = $1 AND u.deleted_at IS NULL`,
        [input.phone],
      )).rows[0];
      if (existing && existing.role !== 'student') {
        throw new ConflictException('This phone number belongs to a landlord or staff account, not a student');
      }
      if (input.email) {
        const taken = await client.query(
          `SELECT 1 FROM users WHERE lower(btrim(email)) = $1 AND deleted_at IS NULL AND ($2::uuid IS NULL OR id <> $2)`,
          [input.email, existing?.id ?? null],
        );
        if (taken.rowCount) throw new ConflictException('That email already belongs to another CampusHomes account');
        // Never attach a landlord-typed email to an account that already
        // exists: sign-in claims by email, so it could hand over someone
        // else's account. Only a brand-new walk-in account takes it.
      }
      const studentId = existing?.id ?? (await client.query<{ id: string }>(
        `INSERT INTO users (phone, contact_phone, email, name, role, status)
         VALUES ($1, $1, $2, $3, 'student', 'active') RETURNING id`,
        [input.phone, input.email ?? null, input.name],
      )).rows[0]!.id;
      if (!existing?.has_profile) {
        await client.query(
          `INSERT INTO students (user_id, university) VALUES ($1, $2::university) ON CONFLICT (user_id) DO NOTHING`,
          [studentId, input.university],
        );
      }
      const email = (await client.query<{ email: string | null }>(`SELECT email FROM users WHERE id = $1`, [studentId])).rows[0]?.email ?? null;
      return {
        studentId,
        email,
        created: !existing,
        propertyName: property?.name ?? 'Your hostel',
        roomLabel: property?.room_label ?? 'your room',
      };
    });

    // book() always returns the row it wrote or throws.
    const booked = (await this.book(ctx, {
      bedId: input.bedId,
      studentPhone: input.phone,
      bookingFeeCollectedUgx: input.bookingFeeCollectedUgx,
      depositCollectedUgx: input.depositCollectedUgx,
      paymentMethod: input.paymentMethod,
    }))!;
    if (input.movedIn) await this.confirmMoveIn(ctx, booked.id);
    await this.audit.record(ctx, 'reservation.walk_in_onboard', 'reservation', booked.id, {
      studentCreated: account.created,
      movedIn: input.movedIn,
    });
    this.notifications
      ?.notify(account.studentId, 'walk_in.onboarded', 'sms', {
        message: `CampusHomes: ${account.propertyName} added your room booking. Sign in at campushomes.co.ug with this phone number to see it.`,
        href: '/reservations',
      })
      .catch((err: unknown) => console.error('[reservations] walk-in SMS failed:', err));
    if (account.email) {
      sendWalkInWelcomeEmail(loadEnv(), {
        to: account.email, studentName: input.name, propertyName: account.propertyName, roomLabel: account.roomLabel, phone: input.phone,
      }).catch((err: unknown) => console.error('[reservations] walk-in email failed:', err instanceof Error ? err.message : err));
    }
    this.notifications
      ?.notify(ctx.userId, 'walk_in.added', 'in_app', {
        message: `You added ${input.name} to ${account.roomLabel} at ${account.propertyName}${input.movedIn ? ' and recorded the move-in' : ''}.`,
        href: '/landlord/bookings',
      })
      .catch((err: unknown) => console.error('[reservations] walk-in notice failed:', err));
    return {
      reservationId: booked.id,
      studentId: account.studentId,
      studentCreated: account.created,
      status: input.movedIn ? 'occupied' as const : 'booked' as const,
    };
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
      await this.assertCanManageBed(client, ctx, reservation.bedId);
      if (!['reserved', 'booked'].includes(reservation.status)) {
        throw new ConflictException(`Cannot release a reservation that is ${reservation.status}`);
      }

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

  /** Per-student rules for a new live reservation: at most
   * MAX_ACTIVE_RESERVATIONS, and one per room type (category + self-contained)
   * per hostel. The transaction-scoped advisory lock serializes concurrent
   * requests for one student, so two beds can't both pass the checks before
   * either commits (the DB's uniqueness is only per bed). */
  private async assertStudentCanTakeRoom(
    client: PoolClient,
    studentId: string,
    bedId: string,
    actor: 'student' | 'landlord',
  ): Promise<void> {
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('reservation-student:' || $1, 0))`, [studentId]);
    const activeCountRes = await client.query(
      `SELECT count(*) FROM reservations WHERE student_id = $1 AND status IN ('reserved', 'booked')`,
      [studentId],
    );
    if (Number(activeCountRes.rows[0].count) >= MAX_ACTIVE_RESERVATIONS) {
      throw new ConflictException(
        actor === 'student'
          ? `You already have ${MAX_ACTIVE_RESERVATIONS} active reservations, the most you can hold at once. Cancel a room on hold in My reservations to reserve this one.`
          : `This student already has ${MAX_ACTIVE_RESERVATIONS} active reservations. Release or complete one before booking another.`,
      );
    }
    const sameRoomRes = await client.query(
      `SELECT 1
       FROM reservations r
       JOIN beds rb ON rb.id = r.bed_id
       JOIN units ru ON ru.id = rb.unit_id
       JOIN beds tb ON tb.id = $2
       JOIN units tu ON tu.id = tb.unit_id
       WHERE r.student_id = $1 AND r.status IN ('reserved', 'booked')
         AND ru.property_id = tu.property_id
         AND ru.room_category = tu.room_category
         AND ru.self_contained = tu.self_contained
       LIMIT 1`,
      [studentId, bedId],
    );
    if (sameRoomRes.rowCount) {
      throw new ConflictException(
        actor === 'student'
          ? 'You already have this room reserved. See My reservations.'
          : 'This student already holds a room of this type here.',
      );
    }
  }

  /** Student asks the landlord to confirm (book) a room they hold. Stamped
   * once; asking again is a no-op, so the landlord isn't notified twice. */
  async requestBooking(ctx: RlsContext, reservationId: string) {
    const result = await this.rlsDb.run(SERVICE(ctx.userId), async (_db, client) => {
      const res = await client.query<{
        status: string; booking_requested_at: Date | null; landlord_id: string; property_name: string; room_category: string;
      }>(
        `SELECT r.status, r.booking_requested_at, p.landlord_id, p.name AS property_name, u.room_category
         FROM reservations r
         JOIN beds b ON b.id = r.bed_id
         JOIN units u ON u.id = b.unit_id
         JOIN properties p ON p.id = u.property_id
         WHERE r.id = $1 AND r.student_id = $2`,
        [reservationId, ctx.userId],
      );
      const row = res.rows[0];
      if (!row) throw new NotFoundException('Reservation not found');
      if (row.status !== 'reserved') {
        throw new ConflictException(`Cannot request booking for a reservation that is ${row.status}`);
      }
      if (row.booking_requested_at) return { requestedAt: row.booking_requested_at, newlyRequested: false, row };
      const updated = await client.query<{ booking_requested_at: Date }>(
        `UPDATE reservations SET booking_requested_at = now(), updated_at = now() WHERE id = $1 RETURNING booking_requested_at`,
        [reservationId],
      );
      return { requestedAt: updated.rows[0]!.booking_requested_at, newlyRequested: true, row };
    });

    if (result.newlyRequested) {
      await this.audit.record(ctx, 'reservation.request_booking', 'reservation', reservationId, {});
      const room = result.row.room_category.replace(/_/g, ' ');
      // Best-effort: the request is stored and shows on the landlord's
      // Reservations page either way.
      for (const channel of ['in_app', 'sms'] as const) {
        this.notifications
          ?.notify(result.row.landlord_id, 'reservation.booking_requested', channel, {
            reservationId,
            message: `A student asked to book a ${room} room at ${result.row.property_name}. Confirm it under Reservations.`,
            href: '/landlord/reservations',
          })
          .catch((err: unknown) => console.error('[reservations] booking request notify failed:', err));
      }
    }
    return { bookingRequestedAt: result.requestedAt };
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
      // Authorize before the status check so a non-party can't probe
      // reservation state by UUID.
      let confirmerRole: 'student' | 'landlord';
      if (reservation.studentId === ctx.userId) {
        confirmerRole = 'student';
      } else {
        await this.assertCanManageBed(client, ctx, reservation.bedId);
        confirmerRole = 'landlord';
      }
      if (reservation.status !== 'booked') {
        throw new ConflictException('Only a booked reservation can be moved into');
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
           r.reserved_at AS "reservedAt", r.reserved_expires_at AS "reservedExpiresAt", r.booked_at AS "bookedAt",
           r.booking_requested_at AS "bookingRequestedAt",
           m.confirmed_at AS "moveInConfirmedAt", r.updated_at AS "updatedAt",
           r.booking_fee_collected_ugx AS "bookingFeeCollectedUgx",
           r.deposit_collected_ugx AS "depositCollectedUgx", r.payment_method AS "paymentMethod",
           l.id AS "listingId", p.name AS "propertyName", p.street_address AS "propertyStreetAddress",
           b.label AS "bedLabel", u.room_category AS "roomCategory", u.capacity AS "roomCapacity",
           r.price_per_term_ugx AS "rentPerTermUgx", r.deposit_ugx AS "depositUgx"
         FROM reservations r
         LEFT JOIN move_ins m ON m.reservation_id = r.id
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
           r.created_at AS "createdAt", b.label AS "bedLabel", m.confirmed_at AS "moveInConfirmedAt",
           r.booking_requested_at AS "bookingRequestedAt"
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
