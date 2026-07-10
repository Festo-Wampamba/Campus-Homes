import {
  date,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { docType, propertyStatus, propertyType, visitResult } from './enums';
import { landlords, opsStaff, users } from './identity';

export const semesters = pgTable('semesters', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(), // e.g. "Semester 1 2026/27"
  startsOn: date('starts_on').notNull(),
  endsOn: date('ends_on').notNull(),
  reVerificationWindowStartsOn: date('re_verification_window_starts_on').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const properties = pgTable('properties', {
  id: uuid('id').primaryKey().defaultRandom(),
  landlordId: uuid('landlord_id')
    .notNull()
    .references(() => landlords.userId, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  streetAddress: text('street_address').notNull(),
  // Set by Ops during verification, never landlord-supplied.
  // gps_point geometry(Point,4326) GENERATED + GiST index added in SQL migration
  // (PostGIS types aren't expressible in drizzle's core column set).
  gpsLat: numeric('gps_lat', { precision: 10, scale: 7 }),
  gpsLon: numeric('gps_lon', { precision: 10, scale: 7 }),
  type: propertyType('type').notNull().default('hostel'),
  status: propertyStatus('status').notNull().default('pending_kyc'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const propertyDocuments = pgTable('property_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  docType: docType('doc_type').notNull(),
  storageKey: text('storage_key').notNull(),
  uploadedBy: uuid('uploaded_by')
    .notNull()
    .references(() => users.id),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  verifiedBy: uuid('verified_by').references(() => opsStaff.userId),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
});

export const verificationVisits = pgTable(
  'verification_visits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'restrict' }),
    inspectorId: uuid('inspector_id')
      .notNull()
      .references(() => opsStaff.userId),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    visitGpsLat: numeric('visit_gps_lat', { precision: 10, scale: 7 }),
    visitGpsLon: numeric('visit_gps_lon', { precision: 10, scale: 7 }),
    // The 6-component checklist. Shape validated by shared Zod schema at the API
    // boundary; completeness enforced by DB trigger before a listing verifies.
    checklist: jsonb('checklist').notNull().default({}),
    clientIdempotencyKey: text('client_idempotency_key').notNull(),
    result: visitResult('result').notNull().default('pending'),
    failureReason: text('failure_reason'),
    approvedBy: uuid('approved_by').references(() => opsStaff.userId),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Offline sync dedup: a retried sync can never create a second visit row.
    uniqueIndex('verification_visits_idempotency_uk').on(t.clientIdempotencyKey),
  ],
);
