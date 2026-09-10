import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import {
  moveInConfirmerRole,
  paymentMethod,
  paymentProvider,
  paymentStatus,
  refundReason,
  refundStatus,
  reservationStatus,
} from './enums';
import { opsStaff, students, users } from './identity';
import { beds, listingVersions } from './listing';

// Reserve -> Book -> Move-in (bed-level redesign, 2026-09, superseding the
// payment-driven held/payment_pending/fulfilled machine). Booking payment is
// expected to happen offline — this table records what the landlord reports
// collecting, it never gates the Reserved -> Booked transition the way
// `payments`/webhooks used to gate Held -> Fulfilled.
export const reservations = pgTable(
  'reservations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.userId, { onDelete: 'restrict' }),
    bedId: uuid('bed_id')
      .notNull()
      .references(() => beds.id, { onDelete: 'restrict' }),
    // Snapshot of the listing as it was at reserve time.
    listingVersionId: uuid('listing_version_id')
      .notNull()
      .references(() => listingVersions.id),
    status: reservationStatus('status').notNull().default('reserved'),
    idempotencyKey: text('idempotency_key').notNull(),

    // Snapshot of the bed's unit_semester_pricing row at reserve time
    // (2026-09 permanent-rooms redesign). Rooms are now reused across
    // semesters and can be repriced, so a reservation can no longer read
    // rent live off the unit — that would silently reprice a continuing
    // tenant's locked-in term the moment a landlord raises next semester's
    // rate. This is the rent that student actually agreed to for this term.
    pricePerTermUgx: integer('price_per_term_ugx').notNull(),
    depositUgx: integer('deposit_ugx'),

    reservedAt: timestamp('reserved_at', { withTimezone: true }),
    // 24h from reserve; cleared once Booked (a booked bed never auto-expires).
    reservedExpiresAt: timestamp('reserved_expires_at', { withTimezone: true }),

    bookedAt: timestamp('booked_at', { withTimezone: true }),
    // The landlord/custodian who clicked Book — null for a still-Reserved row.
    bookedBy: uuid('booked_by').references(() => users.id),
    bookingFeeExpectedUgx: integer('booking_fee_expected_ugx'),
    bookingFeeCollectedUgx: integer('booking_fee_collected_ugx'),
    depositCollectedUgx: integer('deposit_collected_ugx'),
    paymentMethod: paymentMethod('payment_method'),
    paymentRecordedAt: timestamp('payment_recorded_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('reservations_idempotency_uk').on(t.idempotencyKey),
    // THE double-booking lock, moved from unit-scoped to bed-scoped and
    // covering all three live states — a Booked or Occupied bed blocks new
    // reservations same as a Reserved one (an Occupied bed still has to
    // reject a second reservation row, even though its own row never
    // transitions again). Enforced by the database itself; the Redis lock
    // in ReservationsService is an optimization on top of this guarantee.
    uniqueIndex('reservations_one_live_hold_per_bed')
      .on(t.bedId)
      .where(sql`status IN ('reserved', 'booked', 'occupied')`),
  ],
);

// A landlord/custodian/ops freeing up a Reserved or Booked bed the student
// didn't end up taking — distinct from a normal 24h expiry because money may
// already have changed hands offline (booking_fee_collected_ugx /
// deposit_collected_ugx on the reservation row). Mirrors the existing
// `refunds` table's shape/posture: an append-only record, not a status flip
// alone, so there's always a reason and an actor on file.
export const reservationReleases = pgTable('reservation_releases', {
  id: uuid('id').primaryKey().defaultRandom(),
  reservationId: uuid('reservation_id')
    .notNull()
    .references(() => reservations.id, { onDelete: 'restrict' }),
  releasedBy: uuid('released_by')
    .notNull()
    .references(() => users.id),
  reason: text('reason').notNull(),
  // Automated refund execution is a later phase (§16 of the redesign doc) —
  // this just preserves the information a future refund workflow will need.
  refundRequired: boolean('refund_required').notNull().default(false),
  refundStatus: refundStatus('refund_status'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reservationId: uuid('reservation_id')
      .notNull()
      .references(() => reservations.id, { onDelete: 'restrict' }),
    provider: paymentProvider('provider').notNull().default('flutterwave'),
    // Flutterwave transaction id — the webhook idempotency anchor. A retried
    // webhook for the same txn can never double-apply.
    providerTxnId: text('provider_txn_id'),
    providerRef: text('provider_ref'),
    amountUgx: integer('amount_ugx').notNull(),
    currency: text('currency').notNull().default('UGX'),
    paymentMethod: paymentMethod('payment_method').notNull(),
    status: paymentStatus('status').notNull().default('pending'),
    webhookVerified: boolean('webhook_verified').notNull().default(false),
    rawWebhook: jsonb('raw_webhook'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('payments_provider_txn_uk').on(t.providerTxnId)],
);

export const refunds = pgTable('refunds', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id')
    .notNull()
    .references(() => payments.id, { onDelete: 'restrict' }),
  reservationId: uuid('reservation_id')
    .notNull()
    .references(() => reservations.id),
  reason: refundReason('reason').notNull(),
  amountUgx: integer('amount_ugx').notNull(),
  status: refundStatus('status').notNull().default('pending'),
  processedBy: uuid('processed_by').references(() => users.id),
  providerRefundId: text('provider_refund_id'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
});

export const moveIns = pgTable(
  'move_ins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reservationId: uuid('reservation_id')
      .notNull()
      .references(() => reservations.id, { onDelete: 'restrict' }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    confirmedByRole: moveInConfirmerRole('confirmed_by_role').notNull(),
    noShow: boolean('no_show').notNull().default(false),
    landlordFailureFlag: boolean('landlord_failure_flag').notNull().default(false),
    landlordFailureReason: text('landlord_failure_reason'),
    opsVerifiedBy: uuid('ops_verified_by').references(() => opsStaff.userId),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('move_ins_reservation_uk').on(t.reservationId)],
);
