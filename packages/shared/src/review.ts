import { z } from 'zod';

import { uuid } from './common.js';

// Public testimonials strip — GET /listings/reviews (raw SQL row). Only ever
// real reviews (RLS + trigger require a fulfilled reservation to write one,
// 0001) — there is no fabricated/seed testimonial content anywhere.
export const testimonialSchema = z.object({
  id: uuid,
  overall_rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  submitted_at: z.string(),
  property_name: z.string(),
});
export type Testimonial = z.infer<typeof testimonialSchema>;

// Public listing reviews intentionally omit student identity. Reviews are
// written only for fulfilled/occupied reservations by the database rules.
export const listingReviewSchema = z.object({
  id: uuid,
  overall_rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  submitted_at: z.string(),
});
export type ListingReview = z.infer<typeof listingReviewSchema>;

export const listingReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListingReviewsQuery = z.infer<typeof listingReviewsQuerySchema>;

export const listingReviewsPageSchema = z.object({
  items: z.array(listingReviewSchema),
  average: z.number().nullable(),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
export type ListingReviewsPage = z.infer<typeof listingReviewsPageSchema>;
