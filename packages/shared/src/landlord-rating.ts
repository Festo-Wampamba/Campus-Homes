import { z } from 'zod';

import { uuid } from './common.js';

// Students rate landlords (0073): one rating per student and landlord, only
// after reserving at one of the landlord's hostels and messaging them.
export const rateLandlordSchema = z.object({
  landlordId: uuid,
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});
export type RateLandlordInput = z.infer<typeof rateLandlordSchema>;

// Public and landlord-facing rows never carry the student's identity.
export const landlordRatingSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  createdAt: z.string(),
});
export type LandlordRating = z.infer<typeof landlordRatingSchema>;

/** GET /landlord-ratings/landlords/:landlordId/mine — the student's own view. */
export const myLandlordRatingSchema = z.object({
  canRate: z.boolean(),
  rating: landlordRatingSchema.nullable(),
});
export type MyLandlordRating = z.infer<typeof myLandlordRatingSchema>;

/** GET /landlord-ratings/about-me — ratings the signed-in landlord received. */
export const landlordRatingsSummarySchema = z.object({
  average: z.number().nullable(),
  count: z.number().int().nonnegative(),
  items: z.array(landlordRatingSchema),
});
export type LandlordRatingsSummary = z.infer<typeof landlordRatingsSummarySchema>;
