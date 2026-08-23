import { z } from 'zod';

import { uuid } from './common.js';

// Public "Request onboarding" submission from /landlords — no auth, so this
// is intentionally the only unauthenticated write schema in the app.
export const createOnboardingLeadSchema = z.object({
  name: z.string().trim().min(2).max(200),
  phone: z.string().trim().min(6).max(30),
  email: z.union([z.email(), z.literal('')]).optional(),
  propertyLocation: z.string().trim().min(2).max(300),
  message: z.string().trim().max(2000).optional(),
});
export type CreateOnboardingLeadInput = z.infer<typeof createOnboardingLeadSchema>;

export const ONBOARDING_LEAD_STATUSES = ['new', 'contacted', 'converted', 'dismissed'] as const;
export type OnboardingLeadStatus = (typeof ONBOARDING_LEAD_STATUSES)[number];

export const updateOnboardingLeadSchema = z.object({
  status: z.enum(ONBOARDING_LEAD_STATUSES),
});
export type UpdateOnboardingLeadInput = z.infer<typeof updateOnboardingLeadSchema>;

export const onboardingLeadSchema = z.object({
  id: uuid,
  name: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  propertyLocation: z.string(),
  message: z.string().nullable(),
  status: z.enum(ONBOARDING_LEAD_STATUSES),
  contactedBy: uuid.nullable(),
  contactedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type OnboardingLead = z.infer<typeof onboardingLeadSchema>;
