import { z } from 'zod';

import { UNIVERSITIES } from './enums.js';

// Public "browse by university" tile data — GET /listings/campuses (raw SQL
// row, snake_case, same convention as listingSearchResultSchema).
export const campusSchema = z.object({
  university: z.enum(UNIVERSITIES),
  photo_storage_key: z.string().nullable(),
  hostel_count: z.coerce.number().int(),
});
export type Campus = z.infer<typeof campusSchema>;

// Ops-only: POST /ops/campuses/:university/photo.
export const setCampusPhotoSchema = z.object({
  storageKey: z.string().min(1),
});
export type SetCampusPhotoInput = z.infer<typeof setCampusPhotoSchema>;
