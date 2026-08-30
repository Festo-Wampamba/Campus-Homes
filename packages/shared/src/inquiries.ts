import { z } from 'zod';

export const INQUIRY_CATEGORIES = [
  'general',
  'listing',
  'reservation',
  'payment',
  'safety',
  'other',
] as const;
export type InquiryCategory = (typeof INQUIRY_CATEGORIES)[number];

export const INQUIRY_STATUSES = ['open', 'resolved'] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export const createInquirySchema = z.object({
  category: z.enum(INQUIRY_CATEGORIES).default('general'),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(4000),
  // Set when the enquiry is asked from a listing page — the server resolves
  // this to the listing's landlord (landlordId is never client-supplied).
  listingId: z.string().uuid().optional(),
});
export type CreateInquiryInput = z.infer<typeof createInquirySchema>;

export const resolveInquirySchema = z.object({
  status: z.enum(INQUIRY_STATUSES),
  resolution: z.string().trim().max(2000).nullable().optional(),
});
export type ResolveInquiryInput = z.infer<typeof resolveInquirySchema>;

// POST /listings/:id/inquiries/:inquiryId/respond — landlord's reply to a
// listing-scoped enquiry. Column-grant-restricted at the DB level (0031) so
// this can never touch status/resolution, only the landlord_response pair.
export const respondToInquirySchema = z.object({
  response: z.string().trim().min(1).max(2000),
});
export type RespondToInquiryInput = z.infer<typeof respondToInquirySchema>;

// POST /admin/inquiries/:id/forward — notify-only, the inquiry itself stays
// in the shared staff inbox either way (no "assigned to" state). The
// recipient can be any staff member or a landlord (both are just users.id;
// the forward-targets endpoint is what tells the two apart in the UI).
export const forwardInquirySchema = z.object({
  recipientUserId: z.string().uuid(),
  note: z.string().trim().max(500).optional(),
});
export type ForwardInquiryInput = z.infer<typeof forwardInquirySchema>;

export type InquiryForwardTarget = {
  id: string;
  name: string | null;
  role: string;
  label: string; // "Legal Name — Landlord" or "Name — ops_lead", pre-formatted for the picker
};

// List response shape — the service joins in the student's identity so staff
// can reply without a second round trip per row.
export type Inquiry = {
  id: string;
  category: InquiryCategory;
  subject: string;
  message: string;
  status: InquiryStatus;
  resolution: string | null;
  studentId: string;
  studentName: string | null;
  studentEmail: string | null;
  studentPhone: string | null;
  resolvedByName: string | null;
  listingId: string | null;
  landlordId: string | null;
  landlordResponse: string | null;
  landlordRespondedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
