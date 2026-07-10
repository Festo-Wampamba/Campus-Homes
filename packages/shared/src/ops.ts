import { z } from 'zod';

import { STRIKE_REASONS, VISIT_RESULTS } from './enums.js';
import { idempotencyKey, ugxAmount, uuid } from './common.js';
import { verificationChecklistSchema } from './listing.js';

// Ops lead schedules a visit and assigns an inspector (§9 flow 1).
export const scheduleVisitSchema = z.object({
  propertyId: uuid,
  inspectorId: uuid,
  scheduledAt: z.iso.datetime(),
});
export type ScheduleVisitInput = z.infer<typeof scheduleVisitSchema>;

// Offline-sync checklist submission (§9 flow 2). The client generates the
// idempotency key when the visit starts; a retried sync can never double-submit.
export const syncVisitSchema = z.object({
  clientIdempotencyKey: idempotencyKey,
  visitId: uuid,
  checklist: verificationChecklistSchema,
  visitGpsLat: z.number().min(-90).max(90),
  visitGpsLon: z.number().min(-180).max(180),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime(),
  result: z.enum(VISIT_RESULTS.filter((r) => r !== 'pending') as ['passed', 'failed']),
  failureReason: z.string().max(1000).optional(),
});
export type SyncVisitInput = z.infer<typeof syncVisitSchema>;

// Ops-lead listing publish (§9 flow 3): one transaction inserts the immutable
// version snapshot and flips the listing to verified.
export const publishListingSchema = z.object({
  listingId: uuid,
  pricePerTermUgx: ugxAmount,
  amenities: z.record(z.string(), z.boolean()),
  description: z.string().max(5000).optional(),
  // Bed-level units go live with the version. Ops-created: RLS only lets ops
  // insert units, so they ride the publish payload rather than the draft.
  units: z
    .array(
      z.object({
        label: z.string().min(1).max(100),
        capacity: z.number().int().min(1).max(20).default(1),
      }),
    )
    .max(200)
    .default([]),
});
export type PublishListingInput = z.infer<typeof publishListingSchema>;

export const issueStrikeSchema = z.object({
  landlordId: uuid,
  reservationId: uuid.optional(),
  reason: z.enum(STRIKE_REASONS),
  notes: z.string().max(1000).optional(),
});
export type IssueStrikeInput = z.infer<typeof issueStrikeSchema>;
