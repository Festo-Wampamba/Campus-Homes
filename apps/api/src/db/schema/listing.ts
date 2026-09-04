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

import { listingStatus, roomCategory } from './enums';
import { opsStaff, users } from './identity';
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
  label: text('label').notNull(), // "Room 2A"
  // Total occupancy positions in the room — the source of truth for how
  // many `beds` rows get created under it (bed-level redesign, 2026-09).
  capacity: smallint('capacity').notNull().default(1),
  // Room type (single/double/triple/...) — priced independently per category,
  // not one flat price for the whole listing. CHECK price > 0 in SQL migration.
  roomCategory: roomCategory('room_category').notNull().default('other'),
  // Per BED, not per room — a Double at 1,100,000 means each of its 2 beds
  // costs 1,100,000, not 550,000 each. Never divide/multiply this by
  // `capacity`; every revenue/display calc treats it as the bed's own price.
  pricePerTermUgx: integer('price_per_term_ugx').notNull(),
  // Nullable — not every room charges a deposit, and older units predate
  // this column. CHECK >= 0 in SQL migration, same as price's > 0 check.
  depositUgx: integer('deposit_ugx'),
  availableForSemesterId: uuid('available_for_semester_id')
    .notNull()
    .references(() => semesters.id),
  // Room-level manual override (maintenance/blocked take the whole room out
  // of service regardless of individual beds) — walk-in occupancy itself
  // moved to bed-level `beds.blocked` + direct Book-on-Available (0033); this
  // column's remaining values are 'available' (default) and the non-student
  // states 'under_maintenance'/'blocked'. 'vacant'/'held'/'occupied' are
  // legacy pre-0033 values a migration leaves behind on old rows.
  operationalStatus: text('operational_status').notNull().default('available'),
  buildingName: text('building_name'),
  floorLabel: text('floor_label'),
  electricityMeterType: text('electricity_meter_type'),
  amenities: jsonb('amenities').notNull().default({}),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// One row per occupancy position within a room (bed-level redesign, 2026-09)
// — a double's `units.capacity = 2` backs exactly two of these. Reservations
// point at a bed, not a unit, so a partially-let double still shows its
// second bed as available instead of the whole room disappearing.
export const beds = pgTable('beds', {
  id: uuid('id').primaryKey().defaultRandom(),
  unitId: uuid('unit_id')
    .notNull()
    .references(() => units.id, { onDelete: 'cascade' }),
  label: text('label').notNull(), // "Bed 1", "Bed 2"
  // Independent of the reservation-driven Reserved/Booked/Occupied state —
  // a landlord taking a bed out of service (repairs, deliberately held
  // back) with no student involved at all. This is the only bed-level
  // manual override; walk-in bookings go through Book-on-Available instead
  // of a separate occupancy flag, so there's no 'occupied'/'held' value here.
  blocked: boolean('blocked').notNull().default(false),
  blockedReason: text('blocked_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Per-room photos — distinct from listing_photos (Ops-captured during
// verification, whole-listing gallery): these are landlord-uploaded, one
// specific room at a time, visible to students on that room once the
// listing is verified. Units themselves stay Ops-only to write (RLS 0001);
// this table is the landlord's one write surface tied to a room they don't
// otherwise control.
export const unitPhotos = pgTable('unit_photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  unitId: uuid('unit_id')
    .notNull()
    .references(() => units.id, { onDelete: 'cascade' }),
  storageKey: text('storage_key').notNull(),
  uploadedBy: uuid('uploaded_by')
    .notNull()
    .references(() => users.id),
  sortOrder: smallint('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
