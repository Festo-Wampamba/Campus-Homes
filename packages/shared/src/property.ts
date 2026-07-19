import { z } from 'zod';

import {
  DOC_TYPES,
  LISTING_STATUSES,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  RESERVATION_STATUSES,
  ROOM_CATEGORIES,
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
});
export type ProposedRoomCategory = z.infer<typeof proposedRoomCategorySchema>;

// Same free-form shape as listing_versions.amenities (ops.ts) — a plain
// key->boolean map, not a strict enum, so Ops can still publish a key the
// landlord's form doesn't offer yet.
const amenitiesSchema = z.record(z.string(), z.boolean());

export const submitPropertySchema = z.object({
  name: z.string().min(2).max(200),
  streetAddress: z.string().min(3).max(300),
  type: z.enum(PROPERTY_TYPES).default('hostel'),
  // Which university this property serves — drives "browse by university"
  // counts/search. Same vocabulary as students.university.
  catchment: z.enum(UNIVERSITIES),
  proposedRoomCategories: z.array(proposedRoomCategorySchema).max(20).default([]),
  proposedAmenities: amenitiesSchema.default({}),
  coverPhotoKey: z.string().min(1).max(500).nullable().optional(),
});
export type SubmitPropertyInput = z.infer<typeof submitPropertySchema>;

// A landlord can keep editing name/address/catchment/proposed pricing after
// submission (RLS `properties_landlord_update`, 0001) — `type` is excluded
// even though submitPropertySchema has it, since 'hostel' is the only value
// today and status/gps/landlordId are ops-owned and never landlord-writable.
// Built field-by-field rather than `submitPropertySchema.omit({type:true}).partial()`:
// `.partial()` only makes a key optional, it doesn't strip a `.default(...)`
// already on that field, so an update that omits proposedRoomCategories would
// silently apply `default([])` and wipe existing rows instead of leaving
// them untouched.
export const updatePropertySchema = z.object({
  name: submitPropertySchema.shape.name.optional(),
  streetAddress: submitPropertySchema.shape.streetAddress.optional(),
  catchment: submitPropertySchema.shape.catchment.optional(),
  proposedRoomCategories: z.array(proposedRoomCategorySchema).max(20).optional(),
  proposedAmenities: amenitiesSchema.optional(),
  coverPhotoKey: z.string().min(1).max(500).nullable().optional(),
});
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;

export const propertySchema = z.object({
  id: uuid,
  landlordId: uuid,
  name: z.string(),
  streetAddress: z.string(),
  // GPS is set by Ops during verification, never by the landlord.
  gpsLat: z.number().nullable(),
  gpsLon: z.number().nullable(),
  type: z.enum(PROPERTY_TYPES),
  status: z.enum(PROPERTY_STATUSES),
  catchment: z.enum(UNIVERSITIES),
  proposedRoomCategories: z.array(proposedRoomCategorySchema).nullable(),
  proposedAmenities: amenitiesSchema.nullable(),
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

// One row per unit (room) — `reservationStatus` is the unit's current live
// reservation if any ('held'/'payment_pending'/'fulfilled'), null meaning
// available. Read-only: this is the landlord's rooms + reservations view
// (GET /listings/properties/:id/detail), not a write path — reservations
// stay a student-initiated, service_role-only state machine (brief §8).
export const propertyRoomSchema = z.object({
  id: uuid,
  label: z.string(),
  capacity: z.number().int(),
  roomCategory: z.enum(ROOM_CATEGORIES),
  pricePerTermUgx: z.number(),
  reservationStatus: z.enum(RESERVATION_STATUSES).nullable(),
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
});
export type PropertyDetail = z.infer<typeof propertyDetailSchema>;
