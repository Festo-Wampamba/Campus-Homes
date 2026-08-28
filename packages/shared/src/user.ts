import { z } from 'zod';

import {
  CATCHMENTS,
  KYC_STATUSES,
  LANDLORD_BUSINESS_TYPES,
  OPS_TEAMS,
  UNIVERSITIES,
} from './enums.js';
import { uuid } from './common.js';

export const studentProfileSchema = z.object({
  userId: uuid,
  university: z.enum(UNIVERSITIES),
  yearOfStudy: z.number().int().min(1).max(6).nullable(),
});
export type StudentProfile = z.infer<typeof studentProfileSchema>;

export const createStudentProfileSchema = studentProfileSchema.omit({ userId: true });
export type CreateStudentProfileInput = z.infer<typeof createStudentProfileSchema>;

// Once a profile exists, both fields are individually editable — the
// one-time gate only applies to the very first save.
export const updateStudentProfileSchema = z.object({
  university: z.enum(UNIVERSITIES).optional(),
  yearOfStudy: z.number().int().min(1).max(6).nullable().optional(),
});
export type UpdateStudentProfileInput = z.infer<typeof updateStudentProfileSchema>;

export const landlordProfileSchema = z.object({
  userId: uuid,
  legalName: z.string().min(2).max(200),
  kycStatus: z.enum(KYC_STATUSES),
  idDocStorageKey: z.string().nullable(),
  // Landlord & Property Registration Form parity (0025) — Google Form
  // "Landlord/Caretaker Information" section. Deliberately excludes
  // Identity Verification (doc type/number) — landlords are never asked to
  // submit an identity document (privacy decision, product call).
  whatsappNumber: z.string().nullable(),
  businessType: z.enum(LANDLORD_BUSINESS_TYPES),
  businessTypeOther: z.string().nullable(),
});
export type LandlordProfile = z.infer<typeof landlordProfileSchema>;

export const upsertLandlordProfileSchema = z
  .object({
    legalName: z.string().min(2).max(200),
    idDocStorageKey: z.string().min(1).max(500).nullable().optional(),
    whatsappNumber: z.string().trim().max(30).nullable().optional(),
    businessType: z.enum(LANDLORD_BUSINESS_TYPES).default('individual_landlord'),
    businessTypeOther: z.string().trim().max(200).nullable().optional(),
  })
  .refine((v) => v.businessType !== 'other' || Boolean(v.businessTypeOther), {
    message: 'Describe the business type',
    path: ['businessTypeOther'],
  });
export type UpsertLandlordProfileInput = z.infer<typeof upsertLandlordProfileSchema>;

// Self-service identity edits (student and landlord "my profile" pages).
// Deliberately excludes role, status, email, phone, and staff-only fields
// (notes, university, legalName) — those go through their own gated paths.
export const updateSelfParticularsSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  dateOfBirth: z.iso.date().nullable().optional(),
  gender: z.enum(['male', 'female']).nullable().optional(),
  nationality: z.string().trim().max(100).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  emergencyContactName: z.string().trim().max(200).nullable().optional(),
  emergencyContactPhone: z.string().trim().max(30).nullable().optional(),
});
export type UpdateSelfParticularsInput = z.infer<typeof updateSelfParticularsSchema>;

export type SelfParticulars = {
  name: string;
  dateOfBirth: string | null;
  gender: string | null;
  nationality: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
};

export type StudentProfileWithParticulars = StudentProfile & SelfParticulars;
export type LandlordProfileWithParticulars = LandlordProfile & SelfParticulars;

export const opsStaffProfileSchema = z.object({
  userId: uuid,
  team: z.enum(OPS_TEAMS),
  assignedCatchment: z.enum(CATCHMENTS),
  active: z.boolean(),
});
export type OpsStaffProfile = z.infer<typeof opsStaffProfileSchema>;

// Self-service sign-in email change (staff credential accounts). Requires the
// caller's current password — a hijacked session alone must not be able to
// swap the sign-in identity. Password *changes* go through Better Auth's own
// /change-password endpoint; only the email swap needs a custom path (Better
// Auth's changeEmail flow requires an email-verification send, and this stack
// has no email delivery).
export const changeSelfEmailSchema = z.object({
  email: z.email().max(320),
  currentPassword: z.string().min(1).max(200),
});
export type ChangeSelfEmailInput = z.infer<typeof changeSelfEmailSchema>;
