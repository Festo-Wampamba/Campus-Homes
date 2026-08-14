import { z } from 'zod';

import {
  CATCHMENTS,
  KYC_STATUSES,
  LISTING_STATUSES,
  PROPERTY_STATUSES,
  ROOM_CATEGORIES,
  STRIKE_REASONS,
  VISIT_RESULTS,
} from './enums.js';
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
  // Cloudinary public IDs — captured offline in Inspection Mode, uploaded by
  // sync-manager.ts once the device is back online (same deferred-network
  // pattern as the sync itself). Staged on the visit; promoted into
  // listing_photos at publish time once a listing_version exists.
  photoStorageKeys: z.array(z.string()).max(20).default([]),
});
export type SyncVisitInput = z.infer<typeof syncVisitSchema>;

// Ops-lead listing publish (§9 flow 3): one transaction inserts the immutable
// version snapshot and flips the listing to verified.
// There's no single flat price: each room category (single/double/...) is
// priced independently, so the version snapshot's headline price is derived
// server-side as the cheapest category, not entered directly by Ops.
export const publishListingSchema = z.object({
  listingId: uuid,
  amenities: z.record(z.string(), z.boolean()),
  description: z.string().max(5000).optional(),
  // Bed-level units go live with the version. Ops-created: RLS only lets ops
  // insert units, so they ride the publish payload rather than the draft.
  // At least one unit is required — a verified listing needs real inventory
  // to reserve, and price only exists at the unit/category level now.
  units: z
    .array(
      z.object({
        label: z.string().min(1).max(100),
        capacity: z.number().int().min(1).max(20).default(1),
        roomCategory: z.enum(ROOM_CATEGORIES),
        pricePerTermUgx: ugxAmount,
      }),
    )
    .min(1)
    .max(200),
});
export type PublishListingInput = z.infer<typeof publishListingSchema>;

export const issueStrikeSchema = z.object({
  landlordId: uuid,
  reservationId: uuid.optional(),
  reason: z.enum(STRIKE_REASONS),
  notes: z.string().max(1000).optional(),
});
export type IssueStrikeInput = z.infer<typeof issueStrikeSchema>;

// Ops-lead inspector picker (schedule-visit form) — GET /ops/inspectors.
export const opsInspectorSchema = z.object({
  id: uuid,
  name: z.string(),
  catchment: z.enum(CATCHMENTS),
});
export type OpsInspector = z.infer<typeof opsInspectorSchema>;

// Ops-lead verification queue row — GET /ops/queue (raw SQL row, snake_case
// like listingSearchResultSchema — see listing.ts).
export const opsQueueRowSchema = z.object({
  id: uuid,
  name: z.string(),
  street_address: z.string(),
  status: z.enum(PROPERTY_STATUSES),
  created_at: z.string(),
  visit_id: uuid.nullable(),
  result: z.enum(VISIT_RESULTS).nullable(),
  scheduled_at: z.string().nullable(),
  inspector_id: uuid.nullable(),
  landlord_kyc_status: z.enum(KYC_STATUSES),
  age_hours: z.coerce.number(),
});
export type OpsQueueRow = z.infer<typeof opsQueueRowSchema>;

// Inspector's own assigned, not-yet-approved visits — GET /ops/visits/mine
// (raw SQL row).
export const opsVisitMineSchema = z.object({
  visit_id: uuid,
  property_id: uuid,
  property_name: z.string(),
  street_address: z.string(),
  scheduled_at: z.string().nullable(),
  result: z.enum(VISIT_RESULTS),
});
export type OpsVisitMine = z.infer<typeof opsVisitMineSchema>;

// Full visit record for lead review — GET /ops/visits/:id.
export const opsVisitDetailSchema = z.object({
  id: uuid,
  propertyId: uuid,
  inspectorId: uuid,
  scheduledAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  visitGpsLat: z.string().nullable(),
  visitGpsLon: z.string().nullable(),
  checklist: verificationChecklistSchema.partial(),
  result: z.enum(VISIT_RESULTS),
  failureReason: z.string().nullable(),
  approvedBy: uuid.nullable(),
  approvedAt: z.string().nullable(),
});
export type OpsVisitDetail = z.infer<typeof opsVisitDetailSchema>;

// A property's listings, for linking visit approval to the right publish
// target — GET /ops/properties/:id/listings.
export const opsPropertyListingSchema = z.object({
  id: uuid,
  status: z.enum(LISTING_STATUSES),
  semesterId: uuid,
});
export type OpsPropertyListing = z.infer<typeof opsPropertyListingSchema>;

// Ops-lead KYC review queue row — GET /ops/landlords/kyc-queue (raw SQL row,
// landlords joined to users like the verification queue).
export const opsLandlordKycRowSchema = z.object({
  user_id: uuid,
  legal_name: z.string(),
  kyc_status: z.enum(KYC_STATUSES),
  id_doc_storage_key: z.string().nullable(),
  created_at: z.string(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
});
export type OpsLandlordKycRow = z.infer<typeof opsLandlordKycRowSchema>;

// Ops-lead KYC decision — POST /ops/landlords/:userId/kyc.
export const opsKycDecisionSchema = z.object({
  decision: z.enum(['verified', 'rejected']),
});
export type OpsKycDecisionInput = z.infer<typeof opsKycDecisionSchema>;
