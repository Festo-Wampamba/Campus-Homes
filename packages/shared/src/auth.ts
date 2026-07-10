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
