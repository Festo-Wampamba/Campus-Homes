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
});
export type CreateInquiryInput = z.infer<typeof createInquirySchema>;

export const resolveInquirySchema = z.object({
  status: z.enum(INQUIRY_STATUSES),
  resolution: z.string().trim().max(2000).nullable().optional(),
});
export type ResolveInquiryInput = z.infer<typeof resolveInquirySchema>;

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
  createdAt: string;
  updatedAt: string;
};
