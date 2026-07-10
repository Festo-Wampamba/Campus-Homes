import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { listingStatus } from './enums';
import { opsStaff } from './identity';
import { properties, semesters } from './property';

export const listings = pgTable(
  'listings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'restrict' }),
    semesterId: uuid('semester_id')
      .notNull()
      .references(() => semesters.id),
    status: listingStatus('status').notNull().default('draft'),
    // FK to listing_versions added in SQL migration — drizzle can't express the
    // circular reference (listings ↔ listing_versions) without a type error.
    currentVersionId: uuid('current_version_id'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('listings_property_semester_uk').on(t.propertyId, t.semesterId)],
);

// IMMUTABLE — rows are never updated after publish (except superseded_at).
// Reviews and reservations always reference the version active at the time.
export const listingVersions = pgTable(
  'listing_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'restrict' }),
    versionNumber: integer('version_number').notNull(),
    pricePerTermUgx: integer('price_per_term_ugx').notNull(), // CHECK > 0 in SQL migration
    amenities: jsonb('amenities').notNull(),
    description: text('description'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull(),
    verifiedBy: uuid('verified_by')
      .notNull()
      .references(() => opsStaff.userId),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('listing_versions_listing_version_uk').on(t.listingId, t.versionNumber)],
);

export const listingPhotos = pgTable('listing_photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  listingVersionId: uuid('listing_version_id')
    .notNull()
    .references(() => listingVersions.id, { onDelete: 'restrict' }),
  storageKey: text('storage_key').notNull(),
  capturedBy: uuid('captured_by')
    .notNull()
    .references(() => opsStaff.userId),
  // EXIF-verified server-side on upload — client-reported values are never trusted.
  gpsLat: numeric('gps_lat', { precision: 10, scale: 7 }).notNull(),
  gpsLon: numeric('gps_lon', { precision: 10, scale: 7 }).notNull(),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
  isPrimary: boolean('is_primary').notNull().default(false),
  sortOrder: smallint('sort_order').notNull().default(0),
  metadata: jsonb('metadata'),
});

export const units = pgTable('units', {
  id: uuid('id').primaryKey().defaultRandom(),
  listingId: uuid('listing_id')
    .notNull()
    .references(() => listings.id, { onDelete: 'restrict' }),
  label: text('label').notNull(), // "Room 2A / Bed 1"
  capacity: smallint('capacity').notNull().default(1),
  availableForSemesterId: uuid('available_for_semester_id')
    .notNull()
    .references(() => semesters.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
