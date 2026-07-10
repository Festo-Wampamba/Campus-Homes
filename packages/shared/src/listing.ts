import { z } from 'zod';

import { LISTING_STATUSES, VERIFICATION_CHECKLIST_COMPONENTS } from './enums.js';
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
  maxPriceUgx: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListingSearchInput = z.infer<typeof listingSearchSchema>;

// Search response — raw PostGIS rows as the API returns them (snake_case SQL
// aliases; pg numeric columns arrive as strings, hence coerce).
export const listingSearchResultSchema = z.object({
  id: uuid,
  property_id: uuid,
  semester_id: uuid,
  expires_at: z.string().nullable(),
  version_id: uuid,
  price_per_term_ugx: z.number().int(),
  amenities: z.record(z.string(), z.boolean()),
  description: z.string().nullable(),
  name: z.string(),
  street_address: z.string(),
  gps_lat: z.coerce.number(),
  gps_lon: z.coerce.number(),
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
  }),
  photos: z.array(listingPhotoSchema),
  units: z.array(unitSchema),
  availability: z.array(z.object({ id: uuid, available: z.boolean() })),
});
export type ListingDetailResponse = z.infer<typeof listingDetailResponseSchema>;
