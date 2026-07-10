import {
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { strikeReason, studentFlagReason } from './enums';
import { landlords, opsStaff, students, users } from './identity';
import { listingVersions } from './listing';
import { reservations } from './reservation';

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // One review per booking, ever.
    reservationId: uuid('reservation_id')
      .notNull()
      .references(() => reservations.id, { onDelete: 'restrict' }),
    // Anchors the review to the listing-as-it-was, not the listing-as-it-is.
    listingVersionId: uuid('listing_version_id')
      .notNull()
      .references(() => listingVersions.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.userId),
    amenityMatch: jsonb('amenity_match').notNull(),
    overallRating: smallint('overall_rating').notNull(), // CHECK 1–5 in SQL migration
    comment: text('comment'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('reviews_reservation_uk').on(t.reservationId)],
);

// reputation_scores is a MATERIALIZED VIEW — defined in the SQL migration,
// not here. Drizzle only manages real tables.

export const landlordStrikes = pgTable('landlord_strikes', {
  id: uuid('id').primaryKey().defaultRandom(),
  landlordId: uuid('landlord_id')
    .notNull()
    .references(() => landlords.userId, { onDelete: 'restrict' }),
  reason: strikeReason('reason').notNull(),
  reservationId: uuid('reservation_id').references(() => reservations.id),
  description: text('description').notNull(),
  issuedBy: uuid('issued_by')
    .notNull()
    .references(() => opsStaff.userId),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
});

export const studentFlags = pgTable('student_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id')
    .notNull()
    .references(() => students.userId, { onDelete: 'restrict' }),
  reason: studentFlagReason('reason').notNull(),
  reservationId: uuid('reservation_id').references(() => reservations.id),
  description: text('description').notNull(),
  issuedBy: uuid('issued_by')
    .notNull()
    .references(() => opsStaff.userId),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
});

// APPEND-ONLY: no UPDATE/DELETE grants, enforced by RLS + trigger in migration.
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => users.id),
  actorRole: text('actor_role').notNull(), // denormalised snapshot at action time
  action: text('action').notNull(), // e.g. listing.verify, reservation.refund
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id').notNull(),
  payload: jsonb('payload').notNull(),
  ipAddress: text('ip_address'),
  ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
});
