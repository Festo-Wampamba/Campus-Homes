import { z } from 'zod';

import {
  CATCHMENTS,
  KYC_STATUSES,
  LISTING_STATUSES,
  OPS_TEAMS,
  PROPERTY_STATUSES,
  ROOM_CATEGORIES,
  STRIKE_REASONS,
  VERIFICATION_CHECKLIST_COMPONENTS,
  VISIT_RESULTS,
} from './enums.js';
import { idempotencyKey, ugxAmount, uuid } from './common.js';
import { verificationChecklistSchema } from './listing.js';
import { africanPhone } from './phone.js';

// Ops lead schedules a visit and assigns an inspector (§9 flow 1).
export const scheduleVisitSchema = z.object({
  propertyId: uuid,
  inspectorId: uuid,
  scheduledAt: z.iso.datetime(),
});
export type ScheduleVisitInput = z.infer<typeof scheduleVisitSchema>;

// Generous bounding box around Uganda (with margin for border-adjacent
// properties) — catches the failure mode where a desktop/laptop browser's
// IP-based geolocation fallback (no real GPS chip, or a VPN) reports a
// wildly wrong location instead of failing loudly. A listing with GPS
// outside this box can never surface in a Kampala-area bounding-box search
// no matter how it's published, so this must reject at submission time
// rather than fail silently downstream.
export const UGANDA_GPS_BOUNDS = { minLat: -2.5, maxLat: 5, minLon: 28.5, maxLon: 35.5 };

// Offline-sync checklist submission (§9 flow 2). The client generates the
// idempotency key when the visit starts; a retried sync can never double-submit.
export const syncVisitSchema = z.object({
  clientIdempotencyKey: idempotencyKey,
  visitId: uuid,
  checklist: verificationChecklistSchema,
  visitGpsLat: z.number().min(UGANDA_GPS_BOUNDS.minLat).max(UGANDA_GPS_BOUNDS.maxLat, {
    message: 'GPS latitude is outside Uganda — retry on-site with location services enabled (not a desktop browser or VPN).',
  }),
  visitGpsLon: z.number().min(UGANDA_GPS_BOUNDS.minLon).max(UGANDA_GPS_BOUNDS.maxLon, {
    message: 'GPS longitude is outside Uganda — retry on-site with location services enabled (not a desktop browser or VPN).',
  }),
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
        depositUgx: ugxAmount.optional(),
      }),
    )
    .min(1)
    .max(200),
});
export type PublishListingInput = z.infer<typeof publishListingSchema>;

// Backfills listing_photos after publish — an inspector who skipped photos
// at visit time (or whose visit predates this) shouldn't leave a listing
// permanently photo-less; Ops can add more any time, not just at publish.
export const addListingPhotosSchema = z.object({
  storageKeys: z.array(z.string().min(1).max(500)).min(1).max(20),
});
export type AddListingPhotosInput = z.infer<typeof addListingPhotosSchema>;

export const issueStrikeSchema = z.object({
  landlordId: uuid,
  reservationId: uuid.optional(),
  reason: z.enum(STRIKE_REASONS),
  notes: z.string().max(1000).optional(),
});
export type IssueStrikeInput = z.infer<typeof issueStrikeSchema>;

// Self-serve landlord registration invite — creates the account + a
// credential row up front (a random, never-revealed password) purely so
// Better Auth's existing requestPasswordReset/reset-password flow has
// something to reset; the landlord's first real action is setting their own
// password via the email link. Optionally tied to an onboarding_leads row
// (0027), which gets marked 'converted' when provided.
export const inviteLandlordSchema = z.object({
  name: z.string().trim().min(2).max(200),
  email: z.email(),
  phone: africanPhone,
  leadId: uuid.optional(),
});
export type InviteLandlordInput = z.infer<typeof inviteLandlordSchema>;

// Ops-lead inspector picker (schedule-visit form) — GET /ops/inspectors.
// Includes team='lead' rows (MVP full-parity decision) so a lead can
// self-assign a visit instead of always delegating to an inspector.
export const opsInspectorSchema = z.object({
  id: uuid,
  name: z.string(),
  catchment: z.enum(CATCHMENTS),
  team: z.enum(OPS_TEAMS),
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

// Per-checklist-item correction (0029) — a lead sends one component back to
// the assigned inspector; the inspector fixes it and resolves it themselves.
export const visitCorrectionSchema = z.object({
  id: uuid,
  component: z.enum(VERIFICATION_CHECKLIST_COMPONENTS),
  message: z.string(),
  status: z.enum(['open', 'resolved']),
  raisedAt: z.string(),
  resolvedAt: z.string().nullable(),
});
export type VisitCorrection = z.infer<typeof visitCorrectionSchema>;

// POST /ops/visits/:id/corrections — ops_lead/admin only.
export const raiseVisitCorrectionSchema = z.object({
  component: z.enum(VERIFICATION_CHECKLIST_COMPONENTS),
  message: z.string().trim().min(1).max(1000),
});
export type RaiseVisitCorrectionInput = z.infer<typeof raiseVisitCorrectionSchema>;

// PATCH /ops/visits/:id/checklist-item — the assigned inspector fixing a
// flagged component and resubmitting it for review. Photos are additive
// (Cloudinary public IDs already uploaded via POST /uploads/sign), matching
// how the original offline capture works — this never removes an already
// staged photo, only adds more.
export const resolveVisitCorrectionSchema = z.object({
  component: z.enum(VERIFICATION_CHECKLIST_COMPONENTS),
  passed: z.boolean(),
  notes: z.string().max(500).optional(),
  newPhotoStorageKeys: z.array(z.string().min(1).max(500)).max(20).optional(),
});
export type ResolveVisitCorrectionInput = z.infer<typeof resolveVisitCorrectionSchema>;

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
  photoStorageKeys: z.array(z.string()).nullable(),
  result: z.enum(VISIT_RESULTS),
  failureReason: z.string().nullable(),
  approvedBy: uuid.nullable(),
  approvedAt: z.string().nullable(),
  corrections: z.array(visitCorrectionSchema),
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

// Semesters applicable to a property's catchment that don't yet have a listing
// — GET /ops/properties/:id/publishable-semesters. The picker for the ops
// "create the missing listing before publish" step (landlord onboarding never
// creates a listing, so an approved property has nothing to publish otherwise).
export const opsPublishableSemesterSchema = z.object({
  id: uuid,
  name: z.string(),
});
export type OpsPublishableSemester = z.infer<typeof opsPublishableSemesterSchema>;

// Ops-lead creates the draft listing a property is missing before publish —
// POST /ops/listings/draft. Service-role write (ops can't INSERT listings
// under RLS); idempotent on the (property_id, semester_id) unique index.
export const createOpsDraftListingSchema = z.object({
  propertyId: uuid,
  semesterId: uuid,
});
export type CreateOpsDraftListingInput = z.infer<typeof createOpsDraftListingSchema>;

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
