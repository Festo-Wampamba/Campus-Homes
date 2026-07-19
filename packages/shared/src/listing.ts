import { z } from 'zod';

import { LISTING_STATUSES, ROOM_CATEGORIES, VERIFICATION_CHECKLIST_COMPONENTS } from './enums.js';
import { ugxAmount, uuid } from './common.js';

// One entry per checklist component; a listing can only be verified when all 6 pass.
export const checklistComponentResultSchema = z.object({
  passed: z.boolean(),
  notes: z.string().max(500).optional(),
});

export const verificationChecklistSchema = z.object(
  Object.fromEntries(
    VERIFICATION_CHECKLIST_COMPONENTS.map((c) => [c, checklistComponentResultSchema]),
  ) as Record<
    (typeof VERIFICATION_CHECKLIST_COMPONENTS)[number],
    typeof checklistComponentResultSchema
  >,
);
export type VerificationChecklist = z.infer<typeof verificationChecklistSchema>;

export const listingVersionSchema = z.object({
  id: uuid,
  listingId: uuid,
  versionNumber: z.number().int().positive(),
  pricePerTermUgx: ugxAmount,
  amenities: z.record(z.string(), z.boolean()),
  description: z.string().nullable(),
});
export type ListingVersion = z.infer<typeof listingVersionSchema>;

export const listingSchema = z.object({
  id: uuid,
  propertyId: uuid,
  semesterId: uuid,
  status: z.enum(LISTING_STATUSES),
  currentVersionId: uuid.nullable(),
});
export type Listing = z.infer<typeof listingSchema>;

// PostGIS bounding-box search — the student-facing search endpoint's query shape.
export const listingSearchSchema = z.object({
  minLat: z.coerce.number().min(-90).max(90),
  minLon: z.coerce.number().min(-180).max(180),
  maxLat: z.coerce.number().min(-90).max(90),
  maxLon: z.coerce.number().min(-180).max(180),
  minPriceUgx: z.coerce.number().int().positive().optional(),
  maxPriceUgx: z.coerce.number().int().positive().optional(),
  // Rooms sleep different numbers of people (units.capacity) — lets a search
  // ask for "at least a 2-person room" instead of treating every hostel as
  // one undifferentiated price.
  minCapacity: z.coerce.number().int().min(1).max(20).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListingSearchInput = z.infer<typeof listingSearchSchema>;

// One room type's pricing within a listing — a hostel prices singles, doubles,
// triples etc. independently, each backed by any number of individual units.
export const roomCategoryBreakdownSchema = z.object({
  category: z.enum(ROOM_CATEGORIES),
  price_per_term_ugx: z.number().int(),
  unit_count: z.coerce.number().int(),
});
export type RoomCategoryBreakdown = z.infer<typeof roomCategoryBreakdownSchema>;

// Search response — raw PostGIS rows as the API returns them (snake_case SQL
// aliases; pg numeric columns arrive as strings, hence coerce).
export const listingSearchResultSchema = z.object({
  id: uuid,
  property_id: uuid,
  semester_id: uuid,
  expires_at: z.string().nullable(),
  version_id: uuid,
  // "Starting from" price — the cheapest room category, not one flat price.
  price_per_term_ugx: z.number().int(),
  max_price_per_term_ugx: z.number().int(),
  amenities: z.record(z.string(), z.boolean()),
  description: z.string().nullable(),
  name: z.string(),
  street_address: z.string(),
  gps_lat: z.coerce.number(),
  gps_lon: z.coerce.number(),
  // Primary inspection photo (nullable — a card falls back to a placeholder
  // tile when a listing has none) and the room-size spread across its units,
  // so a search result never implies "one room, one price".
  photo_storage_key: z.string().nullable(),
  min_capacity: z.coerce.number().int().nullable(),
  max_capacity: z.coerce.number().int().nullable(),
  unit_count: z.coerce.number().int(),
  room_categories: z.array(roomCategoryBreakdownSchema),
});
export type ListingSearchResult = z.infer<typeof listingSearchResultSchema>;

// Detail response — GET /listings/:id (version snapshot + photos + units +
// per-unit availability booleans).
export const listingPhotoSchema = z.object({
  id: uuid,
  listingVersionId: uuid,
  storageKey: z.string(),
  isPrimary: z.boolean(),
  sortOrder: z.number().int(),
});
export type ListingPhoto = z.infer<typeof listingPhotoSchema>;

export const unitSchema = z.object({
  id: uuid,
  listingId: uuid,
  label: z.string(),
  capacity: z.number().int(),
  roomCategory: z.enum(ROOM_CATEGORIES),
  pricePerTermUgx: z.number().int(),
  availableForSemesterId: uuid,
});
export type Unit = z.infer<typeof unitSchema>;

export const listingDetailResponseSchema = z.object({
  listing: listingSchema.extend({ expiresAt: z.string().nullable() }),
  version: listingVersionSchema,
  // raw SQL row (service-role fetch — properties has no public SELECT policy)
  property: z.object({
    id: uuid,
    name: z.string(),
    street_address: z.string(),
    gps_lat: z.coerce.number().nullable(),
    gps_lon: z.coerce.number().nullable(),
    // The landlord's own contact details — "Rent and tenancy terms are agreed
    // directly with the landlord" (MoneyCard copy) implies contact is expected.
    custodian_name: z.string(),
    custodian_phone: z.string().nullable(),
  }),
  photos: z.array(listingPhotoSchema),
  units: z.array(unitSchema),
  // Landlord-uploaded, per-room — separate from the whole-listing `photos`
  // gallery above (Ops-captured). One row per photo; group by unitId to
  // show "view photos" per room.
  unitPhotos: z.array(z.object({ unitId: uuid, storageKey: z.string() })),
  availability: z.array(z.object({ id: uuid, available: z.boolean() })),
});
export type ListingDetailResponse = z.infer<typeof listingDetailResponseSchema>;
