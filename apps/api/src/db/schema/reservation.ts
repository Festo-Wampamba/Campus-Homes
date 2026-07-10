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
import { listingVersions, units } from './listing';

export const reservations = pgTable(
  'reservations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.userId, { onDelete: 'restrict' }),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'restrict' }),
    // Snapshot of the listing as it was at hold time.
    listingVersionId: uuid('listing_version_id')
      .notNull()
      .references(() => listingVersions.id),
    status: reservationStatus('status').notNull().default('held'),
    feeAmountUgx: integer('fee_amount_ugx').notNull().default(5000),
    holdStartsAt: timestamp('hold_starts_at', { withTimezone: true }),
    holdExpiresAt: timestamp('hold_expires_at', { withTimezone: true }),
    coolingOffExpiresAt: timestamp('cooling_off_expires_at', { withTimezone: true }),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('reservations_idempotency_uk').on(t.idempotencyKey),
    // THE double-booking lock: at most one live hold per unit, enforced by the
    // database itself. The Redis lock is an optimization; this is the guarantee.
    uniqueIndex('reservations_one_live_hold_per_unit')
      .on(t.unitId)
      .where(sql`status = 'held'`),
  ],
);

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
