import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './identity';
import { units } from './listing';
import { properties, semesters } from './property';

export const roomTypes = pgTable(
  'room_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'restrict' }),
    // Circular FK to room_type_versions is added by the SQL migration.
    currentVersionId: uuid('current_version_id'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('room_types_property_idx').on(t.propertyId)],
);

export const roomInventoryChangeSets = pgTable(
  'room_inventory_change_sets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'restrict' }),
    semesterId: uuid('semester_id').notNull().references(() => semesters.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('draft'),
    submittedBy: uuid('submitted_by').references(() => users.id, { onDelete: 'set null' }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    submissionNotes: text('submission_notes'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewerNotes: text('reviewer_notes'),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('room_change_sets_property_status_idx').on(t.propertyId, t.status),
    index('room_change_sets_review_queue_idx').on(t.status, t.submittedAt),
  ],
);

export const roomTypeVersions = pgTable(
  'room_type_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomTypeId: uuid('room_type_id').notNull().references(() => roomTypes.id, { onDelete: 'restrict' }),
    changeSetId: uuid('change_set_id').references(() => roomInventoryChangeSets.id, { onDelete: 'restrict' }),
    versionNumber: integer('version_number').notNull(),
    title: text('title').notNull(),
    category: text('category').notNull(),
    bathroomType: text('bathroom_type').notNull().default('unspecified'),
    capacity: smallint('capacity').notNull(),
    sizeSqm: integer('size_sqm'),
    description: text('description'),
    amenities: jsonb('amenities').notNull().default([]),
    semesterId: uuid('semester_id').notNull().references(() => semesters.id, { onDelete: 'restrict' }),
    pricePerTermUgx: integer('price_per_term_ugx').notNull(),
    depositUgx: integer('deposit_ugx'),
    status: text('status').notNull().default('draft'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewerNotes: text('reviewer_notes'),
    rejectionReason: text('rejection_reason'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('room_type_versions_number_uk').on(t.roomTypeId, t.versionNumber),
    index('room_type_versions_change_set_idx').on(t.changeSetId),
  ],
);

export const roomTypePhotos = pgTable(
  'room_type_photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomTypeVersionId: uuid('room_type_version_id').notNull().references(() => roomTypeVersions.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    sortOrder: smallint('sort_order').notNull().default(0),
    isPrimary: boolean('is_primary').notNull().default(false),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('room_type_photos_storage_uk').on(t.roomTypeVersionId, t.storageKey),
    index('room_type_photos_version_order_idx').on(t.roomTypeVersionId, t.sortOrder),
  ],
);

export const roomUnitChanges = pgTable(
  'room_unit_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    changeSetId: uuid('change_set_id').notNull().references(() => roomInventoryChangeSets.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    unitId: uuid('unit_id').references(() => units.id, { onDelete: 'restrict' }),
    roomTypeId: uuid('room_type_id').references(() => roomTypes.id, { onDelete: 'restrict' }),
    proposedData: jsonb('proposed_data').notNull(),
    idempotencyKey: text('idempotency_key'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('room_unit_changes_change_set_idx').on(t.changeSetId),
    uniqueIndex('room_unit_changes_idempotency_uk').on(t.idempotencyKey),
  ],
);

export const unitBlocks = pgTable(
  'unit_blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    unitId: uuid('unit_id').notNull().references(() => units.id, { onDelete: 'restrict' }),
    reason: text('reason').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    clearedAt: timestamp('cleared_at', { withTimezone: true }),
    clearedBy: uuid('cleared_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('unit_blocks_unit_active_idx').on(t.unitId, t.startsAt, t.endsAt)],
);
