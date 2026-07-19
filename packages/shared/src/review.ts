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
