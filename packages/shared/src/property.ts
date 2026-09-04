import { z } from 'zod';

import {
  DOC_TYPES,
  GENDER_ARRANGEMENTS,
  LISTING_STATUSES,
  PROPERTY_AUTHORITY_ROLES,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  RENT_PERIODS,
  RESERVATION_STATUSES,
  ROOM_CATEGORIES,
  UNIT_OPERATIONAL_STATUSES,
  UNIVERSITIES,
} from './enums.js';
import { ugxAmount, uuid } from './common.js';

// The landlord's intended room-type pricing, e.g. "30 singles at 300k, 40
// doubles at 700k" — informational only, pre-fills the Ops publish form.
// Never authoritative: the live price lives on `units`, which only Ops can
// write. Same category can repeat (e.g. two price tiers of double), so this
// is a plain array, not keyed by category.
export const proposedRoomCategorySchema = z.object({
  category: z.enum(ROOM_CATEGORIES),
  roomCount: z.number().int().min(1).max(500),
  pricePerTermUgx: ugxAmount,
  // Optional — not every property charges a deposit. Same "proposal"
  // status as pricePerTermUgx: informational until Ops confirms it on
  // the real units at publish time.
  depositUgx: ugxAmount.optional(),
  // Captured per row (not as a separate property-level aggregate) so a
  // landlord can express "5 self-contained doubles at 650k, 3 shared-
  // bathroom doubles at 500k" as two rows of the same category, one place —
  // see selfContainedRoomCount/nonSelfContainedRoomCount below, which are
  // now derived from these rows client-side rather than entered separately.
  selfContained: z.boolean().default(false),
});
export type ProposedRoomCategory = z.infer<typeof proposedRoomCategorySchema>;

// Curated pick-list for "which other institutions is this property also
// close to" (2026-08-30 product review — students near Makerere aren't only
// at the 4 catchment universities; institutes and colleges count too).
// Deliberately NOT the `catchment` enum: catchment drives search bounds and
// ops-staff RLS scoping, so it stays locked to the 4 universities the
// platform actually operates in. This list is purely informational (stored
// as plain text in properties.other_catchments, same free-text-array shape
// as amenities/furnishing elsewhere in this file) — a landlord can also type
// one not listed here, nothing server-side rejects an unlisted name.
export const NEARBY_INSTITUTIONS = [
  'Makerere University (MUK)',
  'Makerere University Business School (MUBS)',
  'Kyambogo University (KYU)',
  'Kampala International University (KIU)',
  'Uganda Christian University (UCU)',
  'Nkumba University',
  'Ndejje University',
  'Uganda Martyrs University, Nkozi',
  'Uganda Management Institute (UMI)',
  'Uganda Institute of Information and Communications Technology (UICT)',
  'Cavendish University Uganda',
  'Victoria University Kampala',
  'International Health Sciences University (IHSU)',
  'Bugema University',
  'Kampala University',
  'Institute of Petroleum Studies, Kampala (IPSK)',
] as const;

// Same free-form shape as listing_versions.amenities (ops.ts) — a plain
// key->boolean map, not a strict enum, so Ops can still publish a key the
// landlord's form doesn't offer yet. Reused for utilities/security/
// accessibility too — same "checklist plus custom key" shape throughout.
const amenitiesSchema = z.record(z.string(), z.boolean());

export const submitPropertySchema = z
  .object({
    name: z.string().min(2).max(200),
    alternativeName: z.string().trim().max(200).nullable().optional(),
    streetAddress: z.string().min(3).max(300),
    // Combined "Country, District, Village/Zone, Nearest Landmark" free
    // text — the Google Form asks this as one field, on top of streetAddress.
    locationDetails: z.string().trim().max(500).nullable().optional(),
    type: z.enum(PROPERTY_TYPES).default('hostel'),
    genderArrangement: z.enum(GENDER_ARRANGEMENTS).nullable().optional(),
    // Which university this property serves — drives "browse by university"
    // counts/search. Same vocabulary as students.university.
    catchment: z.enum(UNIVERSITIES),
    otherCatchments: z.array(z.string().trim().min(2).max(150)).max(10).default([]),
    proposedRoomCategories: z.array(proposedRoomCategorySchema).max(20).default([]),
    proposedAmenities: amenitiesSchema.default({}),
    // Google Form "Utilities Included" — furnishing-level (bathroom/
    // kitchen/mattress/...), distinct from properties.utilities (admin-only
    // water/electricity/internet/waste-collection service status).
    furnishingItems: amenitiesSchema.default({}),
    securityFeatures: amenitiesSchema.default({}),
    accessibilityFeatures: amenitiesSchema.default({}),
    photographyConsent: z.boolean().default(false),
    selfContainedRoomCount: z.number().int().min(0).max(2000).nullable().optional(),
    nonSelfContainedRoomCount: z.number().int().min(0).max(2000).nullable().optional(),
    transportShuttle: z.boolean().default(false),
    advanceRentRequired: z.boolean().default(false),
    bookingFeePercent: z.number().int().min(0).max(100).nullable().optional(),
    rentPeriod: z.enum(RENT_PERIODS).nullable().optional(),
    rentPeriodOther: z.string().trim().max(200).nullable().optional(),
    authorityRole: z.enum(PROPERTY_AUTHORITY_ROLES),
    authorityRoleOther: z.string().trim().max(200).nullable().optional(),
    coverPhotoKey: z.string().min(1).max(500).nullable().optional(),
    // The landlord's own 5-item consent (Google Form Section 12) — every
    // one of these must be explicitly true to submit, same z.literal(true)
    // pattern as tenant_agreements' declarationAccepted.
    declaredInfoAccurate: z.literal(true),
    declaredAuthorityOverProperty: z.literal(true),
    declaredWillKeepUpdated: z.literal(true),
    declaredAuthorizesPublish: z.literal(true),
    declaredConsentToProcessing: z.literal(true),
  })
  .refine((v) => v.rentPeriod !== 'other' || Boolean(v.rentPeriodOther), {
    message: 'Describe the rent period',
    path: ['rentPeriodOther'],
  })
  .refine((v) => v.authorityRole !== 'other' || Boolean(v.authorityRoleOther), {
    message: 'Describe your role in relation to this property',
    path: ['authorityRoleOther'],
  });
export type SubmitPropertyInput = z.infer<typeof submitPropertySchema>;

// A landlord can keep editing name/address/catchment/proposed pricing after
// submission (RLS `properties_landlord_update`, 0001) — `type` and the
// 5-item declaration are excluded: `type` because 'hostel' is the only
// value today, the declaration because consent is a one-time act at
// submission, not something to silently re-flip via a later edit.
// status/gps/landlordId are ops-owned and never landlord-writable.
// Built field-by-field rather than `submitPropertySchema.omit(...).partial()`:
// `.partial()` only makes a key optional, it doesn't strip a `.default(...)`
// already on that field, so an update that omits proposedRoomCategories would
// silently apply `default([])` and wipe existing rows instead of leaving
// them untouched. submitPropertySchema is also a ZodEffects (from .refine()),
// so `.shape` isn't available on it — every field below is spelled out fresh.
export const updatePropertySchema = z.object({
  name: z.string().min(2).max(200).optional(),
  alternativeName: z.string().trim().max(200).nullable().optional(),
  streetAddress: z.string().min(3).max(300).optional(),
  locationDetails: z.string().trim().max(500).nullable().optional(),
  genderArrangement: z.enum(GENDER_ARRANGEMENTS).nullable().optional(),
  catchment: z.enum(UNIVERSITIES).optional(),
  otherCatchments: z.array(z.string().trim().min(2).max(150)).max(10).optional(),
  proposedRoomCategories: z.array(proposedRoomCategorySchema).max(20).optional(),
  proposedAmenities: amenitiesSchema.optional(),
  furnishingItems: amenitiesSchema.optional(),
  securityFeatures: amenitiesSchema.optional(),
  accessibilityFeatures: amenitiesSchema.optional(),
  photographyConsent: z.boolean().optional(),
  selfContainedRoomCount: z.number().int().min(0).max(2000).nullable().optional(),
  nonSelfContainedRoomCount: z.number().int().min(0).max(2000).nullable().optional(),
  transportShuttle: z.boolean().optional(),
  advanceRentRequired: z.boolean().optional(),
  bookingFeePercent: z.number().int().min(0).max(100).nullable().optional(),
  rentPeriod: z.enum(RENT_PERIODS).nullable().optional(),
  rentPeriodOther: z.string().trim().max(200).nullable().optional(),
  authorityRole: z.enum(PROPERTY_AUTHORITY_ROLES).optional(),
  authorityRoleOther: z.string().trim().max(200).nullable().optional(),
  coverPhotoKey: z.string().min(1).max(500).nullable().optional(),
});
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;

export const propertySchema = z.object({
  id: uuid,
  landlordId: uuid,
  name: z.string(),
  alternativeName: z.string().nullable(),
  streetAddress: z.string(),
  locationDetails: z.string().nullable(),
  // GPS is set by Ops during verification, never by the landlord.
  gpsLat: z.number().nullable(),
  gpsLon: z.number().nullable(),
  type: z.enum(PROPERTY_TYPES),
  genderArrangement: z.enum(GENDER_ARRANGEMENTS).nullable(),
  status: z.enum(PROPERTY_STATUSES),
  catchment: z.enum(UNIVERSITIES),
  otherCatchments: z.array(z.string()),
  proposedRoomCategories: z.array(proposedRoomCategorySchema).nullable(),
  proposedAmenities: amenitiesSchema.nullable(),
  furnishingItems: amenitiesSchema,
  securityFeatures: amenitiesSchema,
  accessibilityFeatures: amenitiesSchema,
  photographyConsent: z.boolean(),
  selfContainedRoomCount: z.number().int().nullable(),
  nonSelfContainedRoomCount: z.number().int().nullable(),
  transportShuttle: z.boolean(),
  advanceRentRequired: z.boolean(),
  bookingFeePercent: z.number().int().nullable(),
  rentPeriod: z.enum(RENT_PERIODS).nullable(),
  rentPeriodOther: z.string().nullable(),
  authorityRole: z.enum(PROPERTY_AUTHORITY_ROLES).nullable(),
  authorityRoleOther: z.string().nullable(),
  declaredInfoAccurate: z.boolean(),
  declaredAuthorityOverProperty: z.boolean(),
  declaredWillKeepUpdated: z.boolean(),
  declaredAuthorizesPublish: z.boolean(),
  declaredConsentToProcessing: z.boolean(),
  coverPhotoKey: z.string().nullable(),
});
export type Property = z.infer<typeof propertySchema>;

export const propertyDocumentSchema = z.object({
  id: uuid,
  propertyId: uuid,
  docType: z.enum(DOC_TYPES),
  storageKey: z.string(),
});
export type PropertyDocument = z.infer<typeof propertyDocumentSchema>;

// One row per bed (0033) — a room's beds each carry their own live
// reservation, if any (reserved/booked/occupied only; cancelled/released/
// expired/refunded reservations are terminal and omitted, `status: null`).
// `blocked`/`blockedReason` is the manual side of availability: a bed taken
// out of service with no reservation at all (repairs, deliberately held
// back) still needs a way to stop showing as available.
export const propertyRoomBedSchema = z.object({
  id: uuid,
  label: z.string(),
  blocked: z.boolean(),
  blockedReason: z.string().nullable(),
  reservationId: uuid.nullable(),
  status: z.enum(RESERVATION_STATUSES).nullable(),
  reservedExpiresAt: z.iso.datetime().nullable(),
  bookedAt: z.iso.datetime().nullable(),
  bookingFeeCollectedUgx: z.number().nullable(),
  depositCollectedUgx: z.number().nullable(),
});
export type PropertyRoomBed = z.infer<typeof propertyRoomBedSchema>;

// One row per unit (room) — read-only except `operationalStatus`, itself
// writable only through PATCH /listings/units/:id/operational-status (0024)
// — everything else here is the landlord's rooms + reservations view (GET
// /listings/properties/:id/detail); reservations stay a student-initiated
// (Reserve) or landlord-initiated (Book), service_role-only state machine.
export const propertyRoomSchema = z.object({
  id: uuid,
  label: z.string(),
  capacity: z.number().int(),
  roomCategory: z.enum(ROOM_CATEGORIES),
  pricePerTermUgx: z.number(),
  depositUgx: z.number().nullable(),
  operationalStatus: z.enum(UNIT_OPERATIONAL_STATUSES),
  beds: z.array(propertyRoomBedSchema),
  // Landlord-uploaded, per this specific room (unit_photos) — separate from
  // the whole-listing `photos` array above, which is Ops-captured. Carries
  // the photo row's own id (not just storageKey) since removing one calls
  // DELETE /listings/units/photos/:photoId, which needs it.
  photos: z.array(z.object({ id: uuid, storageKey: z.string() })),
});
export type PropertyRoom = z.infer<typeof propertyRoomSchema>;

export const propertyDetailSchema = z.object({
  property: propertySchema,
  listing: z
    .object({
      id: uuid,
      status: z.enum(LISTING_STATUSES),
      description: z.string().nullable(),
      pricePerTermUgx: z.number().nullable(),
    })
    .nullable(),
  photos: z.array(z.string()),
  rooms: z.array(propertyRoomSchema),
  // Whole-property gallery, landlord-manageable (0026) — distinct from
  // `photos` above (Ops-captured listing_photos) and each room's own photos.
  propertyMedia: z.array(z.object({ id: uuid, storageKey: z.string() })),
});
export type PropertyDetail = z.infer<typeof propertyDetailSchema>;

// Bare name/address for the QR tenant-agreement landing page — GET
// /listings/properties/:id/summary (raw SQL row, snake_case like
// listingSearchResultSchema).
export const propertySummarySchema = z.object({
  id: uuid,
  name: z.string(),
  street_address: z.string(),
  catchment: z.enum(UNIVERSITIES),
});
export type PropertySummary = z.infer<typeof propertySummarySchema>;
