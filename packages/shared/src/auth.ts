import { z } from 'zod';

import { USER_ROLES, USER_STATUSES } from './enums.js';
import { ugPhone, uuid } from './common.js';

// ── Phone OTP (students & landlords) ─────────────────────────────────────────

export const requestOtpSchema = z.object({
  phone: ugPhone,
});
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

export const verifyOtpSchema = z.object({
  phone: ugPhone,
  code: z.string().regex(/^\d{6}$/, 'OTP is 6 digits'),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

// ── Landlord self-registration ───────────────────────────────────────────────

// Public, unauthenticated: creates a `users` row (role: landlord,
// status: pending) plus a Better Auth credential account, so sign-in
// afterward is ordinary email+password (same mechanism admin-provisioned
// staff/landlord accounts already use) — phone is still collected and
// stored for contact/OTP purposes, just not required for sign-in. Legal
// name, ID doc, and property details stay in the existing onboarding
// wizard, which only becomes reachable once an ops lead/admin approves the
// account (status -> active). See landlords.service.ts `register()`.
export const landlordSelfRegisterSchema = z.object({
  name: z.string().trim().min(2).max(200),
  email: z.email(),
  phone: ugPhone,
  password: z.string().min(8).max(200),
});
export type LandlordSelfRegisterInput = z.infer<typeof landlordSelfRegisterSchema>;

export type PendingLandlordAccount = {
  userId: string;
  name: string;
  phone: string | null;
  createdAt: string;
};

export const rejectLandlordAccountSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type RejectLandlordAccountInput = z.infer<typeof rejectLandlordAccountSchema>;

// ── Email/password (Ops & Admin only) ────────────────────────────────────────

export const emailLoginSchema = z.object({
  email: z.email(),
  password: z.string().min(12, 'Ops/Admin passwords must be at least 12 characters'),
});
export type EmailLoginInput = z.infer<typeof emailLoginSchema>;

// ── Session shape returned to clients ────────────────────────────────────────

export const sessionUserSchema = z.object({
  id: uuid,
  phone: ugPhone.nullable(),
  email: z.email().nullable(),
  role: z.enum(USER_ROLES),
  status: z.enum(USER_STATUSES),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;
