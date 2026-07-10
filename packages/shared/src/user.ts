import { z } from 'zod';

import { CATCHMENTS, KYC_STATUSES, OPS_TEAMS, UNIVERSITIES } from './enums.js';
import { uuid } from './common.js';

export const studentProfileSchema = z.object({
  userId: uuid,
  university: z.enum(UNIVERSITIES),
  yearOfStudy: z.number().int().min(1).max(6).nullable(),
});
export type StudentProfile = z.infer<typeof studentProfileSchema>;

export const createStudentProfileSchema = studentProfileSchema.omit({ userId: true });
export type CreateStudentProfileInput = z.infer<typeof createStudentProfileSchema>;

export const landlordProfileSchema = z.object({
  userId: uuid,
  legalName: z.string().min(2).max(200),
  kycStatus: z.enum(KYC_STATUSES),
  idDocStorageKey: z.string().nullable(),
});
export type LandlordProfile = z.infer<typeof landlordProfileSchema>;

export const upsertLandlordProfileSchema = z.object({
  legalName: z.string().min(2).max(200),
  idDocStorageKey: z.string().min(1).max(500).nullable().optional(),
});
export type UpsertLandlordProfileInput = z.infer<typeof upsertLandlordProfileSchema>;

export const opsStaffProfileSchema = z.object({
  userId: uuid,
  team: z.enum(OPS_TEAMS),
  assignedCatchment: z.enum(CATCHMENTS),
  active: z.boolean(),
});
export type OpsStaffProfile = z.infer<typeof opsStaffProfileSchema>;
