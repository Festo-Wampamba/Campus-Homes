import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { docType, propertyStatus, propertyType, university, visitResult } from './enums';
import { landlords, opsStaff, users } from './identity';

export const semesters = pgTable('semesters', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(), // e.g. "Semester 1 2026/27"
  university: university('university'),
  semesterType: text('semester_type'),
  academicYear: text('academic_year'),
  customName: text('custom_name'),
  startsOn: date('starts_on').notNull(),
  endsOn: date('ends_on').notNull(),
  reVerificationWindowStartsOn: date('re_verification_window_starts_on').notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
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
  // Which university this property serves — landlord-declared at submission,
  // drives "browse by university" counts and search. Reuses the same enum
  // as students.university for a shared vocabulary; 'other' is the overflow.
  catchment: university('catchment').notNull(),
  // Landlord's intended room-category pricing at submission time — informational
  // only, pre-fills the Ops publish form. Never authoritative: the live price
  // lives on `units`, which only Ops can write (RLS, 0001).
  proposedRoomCategories: jsonb('proposed_room_categories'),
  // Landlord-declared amenities (wifi, parking, water_supply, ...) —
  // informational only, same "proposal" status as proposedRoomCategories:
  // pre-fills the Ops publish form, never authoritative. The live amenities
  // list lives on `listing_versions.amenities`, which only Ops can write.
  proposedAmenities: jsonb('proposed_amenities'),
  // Landlord-uploaded cover photo (Cloudinary public ID, same upload path as
  // property documents) — shown on property cards/list rows and in the
  // detail dialog. Distinct from listing_photos, which are Ops-captured
  // during verification and only exist once a listing is published.
  coverPhotoKey: text('cover_photo_key'),
  description: text('description'),
  operationalStatus: text('operational_status').notNull().default('open'),
  amenities: jsonb('amenities').notNull().default({}),
  utilities: jsonb('utilities').notNull().default({}),
  houseRules: jsonb('house_rules').notNull().default([]),
  contactPhone: text('contact_phone'),
  contactEmail: text('contact_email'),
  // Landlord & Property Registration Form parity (0025) — the rest of this
  // table mirrors the Google Form's Property Details / Location / Authority /
  // Room Information / Security / Accessibility / Consent sections. All
  // text + CHECK or plain jsonb, not pgEnum, matching operationalStatus above.
  alternativeName: text('alternative_name'),
  genderArrangement: text('gender_arrangement'),
  // Multi-select "Other Universities Served" — catchment above stays the
  // single primary one search/browse already key off; this is informational.
  otherCatchments: jsonb('other_catchments').notNull().default([]),
  // Combined "Country, District, Village/Zone, Nearest Landmark" free text —
  // the Google Form asks this as one field, distinct from streetAddress.
  locationDetails: text('location_details'),
  authorityRole: text('authority_role'),
  authorityRoleOther: text('authority_role_other'),
  transportShuttle: boolean('transport_shuttle').notNull().default(false),
  advanceRentRequired: boolean('advance_rent_required').notNull().default(false),
  bookingFeePercent: smallint('booking_fee_percent'),
  rentPeriod: text('rent_period'),
  rentPeriodOther: text('rent_period_other'),
  // Distinct from `utilities` above (water/electricity/internet/waste
  // status) — the Google Form's furnishing checklist (bathroom/kitchen/
  // mattress/wardrobe/...), a different concept that just shares a word.
  furnishingItems: jsonb('furnishing_items').notNull().default({}),
  securityFeatures: jsonb('security_features').notNull().default({}),
  accessibilityFeatures: jsonb('accessibility_features').notNull().default({}),
  photographyConsent: boolean('photography_consent').notNull().default(false),
  // Aggregate counts declared at registration — informational, like
  // proposedRoomCategories, not tied 1:1 to real units (which don't exist
  // until Ops publishes).
  selfContainedRoomCount: smallint('self_contained_room_count'),
  nonSelfContainedRoomCount: smallint('non_self_contained_room_count'),
  // The landlord's own 5-item consent (Google Form Section 12) — mirrors
  // TENANT_AGREEMENT_DECLARATION_TEXT's pattern but as 5 discrete checkboxes
  // instead of one block, matching the source form. No backfill-true for
  // existing rows (unlike tenant_agreements' declaration_accepted): those
  // properties never actually attested to this, so false is the honest
  // default, not a retroactive claim of consent.
  declaredInfoAccurate: boolean('declared_info_accurate').notNull().default(false),
  declaredAuthorityOverProperty: boolean('declared_authority_over_property').notNull().default(false),
  declaredWillKeepUpdated: boolean('declared_will_keep_updated').notNull().default(false),
  declaredAuthorizesPublish: boolean('declared_authorizes_publish').notNull().default(false),
  declaredConsentToProcessing: boolean('declared_consent_to_processing').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const propertyMedia = pgTable('property_media', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  storageKey: text('storage_key').notNull(),
  mediaType: text('media_type').notNull().default('image'),
  caption: text('caption'),
  sortOrder: smallint('sort_order').notNull().default(0),
  uploadedBy: uuid('uploaded_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const propertyMemberships = pgTable(
  'property_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    workerType: text('worker_type'),
    status: text('status').notNull().default('active'),
    assignedBy: uuid('assigned_by').notNull().references(() => users.id),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by').references(() => users.id),
    revocationReason: text('revocation_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('property_memberships_active_uk')
      .on(t.userId, t.propertyId, t.role)
      .where(sql`revoked_at IS NULL`),
  ],
);

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
    // Cloudinary public IDs, uploaded at sync time (inspection-form.tsx
    // captures the files offline; sync-manager.ts uploads them once back
    // online, same deferred-network pattern as the rest of Inspection Mode).
    // Staged here, not inserted into listing_photos directly — that table
    // needs a listing_version_id, which doesn't exist until publish time
    // (ops.service.ts publishListing() promotes them then).
    photoStorageKeys: jsonb('photo_storage_keys'),
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
