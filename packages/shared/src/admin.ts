import { z } from 'zod';

import {
  ASSIGNABLE_ROLE_KEYS,
  CATCHMENTS,
  GENDER_ARRANGEMENTS,
  LANDLORD_BUSINESS_TYPES,
  PROPERTY_AUTHORITY_ROLES,
  PROPERTY_OPERATIONAL_STATUSES,
  PROPERTY_TYPES,
  RENT_PERIODS,
  ROOM_CATEGORIES,
  UNIT_OPERATIONAL_STATUSES,
  UNIVERSITIES,
  USER_ROLES,
  USER_STATUSES,
  WORKER_TYPES,
} from './enums.js';
import { uuid } from './common.js';
import { africanPhone } from './phone.js';

const optionalEmail = z.union([z.email(), z.literal('')]).optional();
const optionalPhone = z.union([africanPhone, z.literal('')]).optional();

export const adminUserParticularsSchema = z.object({
  dateOfBirth: z.iso.date().nullable().optional(),
  gender: z.enum(['male', 'female']).nullable().optional(),
  nationality: z.string().trim().max(100).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  emergencyContactName: z.string().trim().max(200).nullable().optional(),
  emergencyContactPhone: z.string().trim().max(30).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  university: z.enum(UNIVERSITIES).optional(),
  yearOfStudy: z.number().int().min(1).max(6).nullable().optional(),
  legalName: z.string().trim().min(2).max(200).optional(),
  // Landlord & Property Registration Form parity (0025) — captured here too
  // so Ops can fill these in for a landlord during a concierge onboarding
  // visit, same as legalName above. Deliberately no identity-document
  // fields — landlords are never asked to submit one (privacy decision).
  whatsappNumber: z.string().trim().max(30).nullable().optional(),
  businessType: z.enum(LANDLORD_BUSINESS_TYPES).optional(),
  businessTypeOther: z.string().trim().max(200).nullable().optional(),
});

export const createAdminUserSchema = adminUserParticularsSchema
  .extend({
    name: z.string().trim().min(1).max(200),
    email: optionalEmail,
    phone: optionalPhone,
    accountType: z.enum(USER_ROLES),
    status: z.enum(USER_STATUSES).default('active'),
    temporaryPassword: z.string().min(16).max(200).optional(),
  })
  .refine((value) => Boolean(value.email || value.phone), {
    message: 'Email or phone is required',
    path: ['email'],
  })
  .refine((value) => !value.temporaryPassword || Boolean(value.email), {
    message: 'An email address is required when setting a temporary password',
    path: ['email'],
  })
  .refine((value) => value.accountType !== 'student' || Boolean(value.university), {
    message: 'University is required for student accounts',
    path: ['university'],
  })
  .refine((value) => value.accountType !== 'student' || Boolean(value.yearOfStudy), {
    message: 'Year of study is required for student accounts',
    path: ['yearOfStudy'],
  })
  .refine((value) => value.accountType !== 'landlord' || Boolean(value.legalName), {
    message: 'Legal name is required for landlord accounts',
    path: ['legalName'],
  });
export type CreateAdminUserInput = z.infer<typeof createAdminUserSchema>;

export const updateAdminUserSchema = adminUserParticularsSchema.extend({
  name: z.string().trim().min(1).max(200).optional(),
  email: optionalEmail,
  phone: optionalPhone,
  accountType: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  image: z.union([z.url(), z.literal(''), z.null()]).optional(),
}).refine((value) => value.accountType !== 'student' || Boolean(value.university), {
  message: 'University is required for student accounts',
  path: ['university'],
}).refine((value) => value.accountType !== 'student' || Boolean(value.yearOfStudy), {
  message: 'Year of study is required for student accounts',
  path: ['yearOfStudy'],
});
export type UpdateAdminUserInput = z.infer<typeof updateAdminUserSchema>;

export const deleteAdminUserSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type DeleteAdminUserInput = z.infer<typeof deleteAdminUserSchema>;

export const adminRoleAssignmentSchema = z
  .object({
    roleKey: z.enum(ASSIGNABLE_ROLE_KEYS),
    scopeType: z.enum(['platform_wide', 'catchment', 'property', 'own']),
    scopeId: z.string().trim().min(1).max(200).optional(),
    workerType: z.enum(WORKER_TYPES).optional(),
    reason: z.string().trim().min(3).max(500),
    validUntil: z.iso.datetime().optional(),
  })
  .refine((value) => value.scopeType === 'platform_wide' || value.scopeType === 'own' || Boolean(value.scopeId), {
    message: 'scopeId is required for catchment or property access',
    path: ['scopeId'],
  });
export type AdminRoleAssignmentInput = z.infer<typeof adminRoleAssignmentSchema>;

export const adminPermissionGrantSchema = z
  .object({
    permissionKeys: z.array(z.string().trim().min(1).max(120)).min(1).max(200),
    scopeType: z.enum(['platform_wide', 'catchment', 'property', 'own']).default('platform_wide'),
    scopeId: z.string().trim().min(1).max(200).optional(),
    reason: z.string().trim().min(3).max(500),
    validUntil: z.iso.datetime().optional(),
  })
  .refine((value) => value.scopeType === 'platform_wide' || value.scopeType === 'own' || Boolean(value.scopeId), {
    message: 'scopeId is required for catchment or property access',
    path: ['scopeId'],
  });
export type AdminPermissionGrantInput = z.infer<typeof adminPermissionGrantSchema>;

export const adminUnitInputSchema = z.object({
  label: z.string().trim().min(1).max(100),
  capacity: z.number().int().min(1).max(50).default(1),
  roomCategory: z.enum(ROOM_CATEGORIES).default('single'),
  pricePerTermUgx: z.number().int().positive().max(100_000_000),
  depositUgx: z.number().int().min(0).max(100_000_000).nullable().optional(),
  operationalStatus: z.enum(UNIT_OPERATIONAL_STATUSES).default('available'),
  buildingName: z.string().trim().max(100).nullable().optional(),
  floorLabel: z.string().trim().max(50).nullable().optional(),
  electricityMeterType: z.enum(['prepaid', 'postpaid', 'shared', 'included', 'none']).nullable().optional(),
  amenities: z.record(z.string(), z.boolean()).default({}),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type AdminUnitInput = z.infer<typeof adminUnitInputSchema>;

export const createAdminPropertySchema = z
  .object({
    landlordId: uuid,
    name: z.string().trim().min(2).max(200),
    alternativeName: z.string().trim().max(200).nullable().optional(),
    streetAddress: z.string().trim().min(3).max(300),
    locationDetails: z.string().trim().max(500).nullable().optional(),
    type: z.enum(PROPERTY_TYPES).default('hostel'),
    genderArrangement: z.enum(GENDER_ARRANGEMENTS).nullable().optional(),
    catchment: z.enum(UNIVERSITIES),
    otherCatchments: z.array(z.enum(UNIVERSITIES)).max(10).default([]),
    description: z.string().trim().max(5000).nullable().optional(),
    operationalStatus: z.enum(PROPERTY_OPERATIONAL_STATUSES).default('open'),
    amenities: z.record(z.string(), z.boolean()).default({}),
    utilities: z.record(z.string(), z.union([z.boolean(), z.string(), z.number()])).default({}),
    // Google Form "Utilities Included" (furnishing-level) — distinct from
    // `utilities` above (water/electricity/internet/waste-collection status).
    furnishingItems: z.record(z.string(), z.boolean()).default({}),
    securityFeatures: z.record(z.string(), z.boolean()).default({}),
    accessibilityFeatures: z.record(z.string(), z.boolean()).default({}),
    photographyConsent: z.boolean().default(false),
    selfContainedRoomCount: z.number().int().min(0).max(2000).nullable().optional(),
    nonSelfContainedRoomCount: z.number().int().min(0).max(2000).nullable().optional(),
    transportShuttle: z.boolean().default(false),
    advanceRentRequired: z.boolean().default(false),
    bookingFeePercent: z.number().int().min(0).max(100).nullable().optional(),
    rentPeriod: z.enum(RENT_PERIODS).nullable().optional(),
    rentPeriodOther: z.string().trim().max(200).nullable().optional(),
    authorityRole: z.enum(PROPERTY_AUTHORITY_ROLES).nullable().optional(),
    authorityRoleOther: z.string().trim().max(200).nullable().optional(),
    // Ops confirms these on the landlord's behalf during a concierge visit —
    // optional (unlike the self-serve submitPropertySchema's required
    // z.literal(true)) since ops isn't the one personally attesting, just
    // recording what the landlord agreed to on paper/in person.
    declaredInfoAccurate: z.boolean().default(false),
    declaredAuthorityOverProperty: z.boolean().default(false),
    declaredWillKeepUpdated: z.boolean().default(false),
    declaredAuthorizesPublish: z.boolean().default(false),
    declaredConsentToProcessing: z.boolean().default(false),
    houseRules: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
    contactPhone: z.string().trim().max(30).nullable().optional(),
    contactEmail: z.union([z.email(), z.literal(''), z.null()]).optional(),
    coverPhotoKey: z.string().trim().min(1).max(500).nullable().optional(),
    imageKeys: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
    semesterId: uuid.optional(),
    units: z.array(adminUnitInputSchema).max(500).default([]),
  })
  .refine((value) => value.units.length === 0 || Boolean(value.semesterId), {
    message: 'A semester is required when adding units',
    path: ['semesterId'],
  });
export type CreateAdminPropertyInput = z.infer<typeof createAdminPropertySchema>;

export const updateAdminPropertySchema = z.object({
  landlordId: uuid.optional(),
  name: z.string().trim().min(2).max(200).optional(),
  alternativeName: z.string().trim().max(200).nullable().optional(),
  streetAddress: z.string().trim().min(3).max(300).optional(),
  locationDetails: z.string().trim().max(500).nullable().optional(),
  type: z.enum(PROPERTY_TYPES).optional(),
  genderArrangement: z.enum(GENDER_ARRANGEMENTS).nullable().optional(),
  catchment: z.enum(UNIVERSITIES).optional(),
  otherCatchments: z.array(z.enum(UNIVERSITIES)).max(10).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  operationalStatus: z.enum(PROPERTY_OPERATIONAL_STATUSES).optional(),
  amenities: z.record(z.string(), z.boolean()).optional(),
  utilities: z.record(z.string(), z.union([z.boolean(), z.string(), z.number()])).optional(),
  furnishingItems: z.record(z.string(), z.boolean()).optional(),
  securityFeatures: z.record(z.string(), z.boolean()).optional(),
  accessibilityFeatures: z.record(z.string(), z.boolean()).optional(),
  photographyConsent: z.boolean().optional(),
  selfContainedRoomCount: z.number().int().min(0).max(2000).nullable().optional(),
  nonSelfContainedRoomCount: z.number().int().min(0).max(2000).nullable().optional(),
  transportShuttle: z.boolean().optional(),
  advanceRentRequired: z.boolean().optional(),
  bookingFeePercent: z.number().int().min(0).max(100).nullable().optional(),
  rentPeriod: z.enum(RENT_PERIODS).nullable().optional(),
  rentPeriodOther: z.string().trim().max(200).nullable().optional(),
  authorityRole: z.enum(PROPERTY_AUTHORITY_ROLES).nullable().optional(),
  authorityRoleOther: z.string().trim().max(200).nullable().optional(),
  declaredInfoAccurate: z.boolean().optional(),
  declaredAuthorityOverProperty: z.boolean().optional(),
  declaredWillKeepUpdated: z.boolean().optional(),
  declaredAuthorizesPublish: z.boolean().optional(),
  declaredConsentToProcessing: z.boolean().optional(),
  houseRules: z.array(z.string().trim().min(1).max(300)).max(50).optional(),
  contactPhone: z.string().trim().max(30).nullable().optional(),
  contactEmail: z.union([z.email(), z.literal(''), z.null()]).optional(),
  coverPhotoKey: z.string().trim().min(1).max(500).nullable().optional(),
});
export type UpdateAdminPropertyInput = z.infer<typeof updateAdminPropertySchema>;

export const addAdminPropertyUnitsSchema = z.object({
  semesterId: uuid,
  units: z.array(adminUnitInputSchema).min(1).max(500),
});
export type AddAdminPropertyUnitsInput = z.infer<typeof addAdminPropertyUnitsSchema>;

export const addAdminPropertyMediaSchema = z.object({
  mediaType: z.enum(['image', 'document', 'floor_plan', 'video']).default('image'),
  items: z.array(z.object({
    storageKey: z.string().trim().min(1).max(500),
    caption: z.string().trim().max(300).nullable().optional(),
  })).min(1).max(30),
});
export type AddAdminPropertyMediaInput = z.infer<typeof addAdminPropertyMediaSchema>;

export const platformSettingsUpdateSchema = z.object({
  reservationHoldHours: z.number().int().min(1).max(168).optional(),
  reservationFeeUgx: z.number().int().min(0).max(1_000_000).optional(),
  verificationValidMonths: z.number().int().min(1).max(60).optional(),
  registrationsOpen: z.boolean().optional(),
  maintenanceMode: z.boolean().optional(),
  reportRetentionDays: z.number().int().min(30).max(3650).optional(),
  supportContact: z.object({ email: z.email(), phone: z.string().trim().max(30) }).optional(),
});
export type PlatformSettingsUpdateInput = z.infer<typeof platformSettingsUpdateSchema>;

export const SEMESTER_TYPES = ['semester_1', 'semester_2', 'semester_3', 'custom'] as const;

const semesterFields = {
  university: z.enum(UNIVERSITIES),
  semesterType: z.enum(SEMESTER_TYPES),
  academicYear: z.string().trim().regex(/^\d{4}\/(?:\d{2}|\d{4})$/, 'Use an academic year such as 2026/27'),
  customName: z.string().trim().min(3).max(80).optional(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  reVerificationWindowStartsOn: z.iso.date(),
};

export const createSemesterSchema = z.object(semesterFields)
  .refine((value) => value.semesterType !== 'custom' || Boolean(value.customName), {
    message: 'Enter a name for a custom semester',
    path: ['customName'],
  })
  .refine((value) => value.startsOn < value.endsOn, {
    message: 'Semester end date must be after its start date',
    path: ['endsOn'],
  })
  .refine((value) => value.reVerificationWindowStartsOn <= value.startsOn, {
    message: 'Reverification must open on or before the semester starts',
    path: ['reVerificationWindowStartsOn'],
  });
// Define update fields explicitly. Zod 4 rejects `.partial()` when another
// object created from the same field map has object-level refinements.
export const updateSemesterSchema = z.object({
  university: z.enum(UNIVERSITIES).optional(),
  semesterType: z.enum(SEMESTER_TYPES).optional(),
  academicYear: z.string().trim().regex(/^\d{4}\/(?:\d{2}|\d{4})$/, 'Use an academic year such as 2026/27').optional(),
  customName: z.string().trim().min(3).max(80).nullable().optional(),
  startsOn: z.iso.date().optional(),
  endsOn: z.iso.date().optional(),
  reVerificationWindowStartsOn: z.iso.date().optional(),
});
export type CreateSemesterInput = z.infer<typeof createSemesterSchema>;
export type UpdateSemesterInput = z.infer<typeof updateSemesterSchema>;

const integrationFields = z.object({
  name: z.string().trim().min(2).max(150),
  purpose: z.string().trim().min(3).max(500),
  category: z.enum(['payments', 'communications', 'maps', 'learning', 'transport', 'health', 'safety', 'analytics', 'finance', 'storage', 'operations', 'other']),
  audience: z.enum(['internal', 'students', 'landlords', 'all']),
  baseUrl: z.union([z.url(), z.literal(''), z.null()]).optional(),
  enabled: z.boolean().default(false),
  config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});
export const createIntegrationSchema = integrationFields.extend({
  key: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(80),
});
export const updateIntegrationSchema = integrationFields.partial();
export type CreateIntegrationInput = z.infer<typeof createIntegrationSchema>;
export type UpdateIntegrationInput = z.infer<typeof updateIntegrationSchema>;

export const reportExportRequestSchema = z.object({
  reportType: z.enum(['platform', 'catchments', 'users', 'properties', 'reservations', 'finance', 'verifications']),
  format: z.enum(['csv', 'xlsx', 'pdf', 'docx', 'pptx', 'json']),
  destination: z.enum(['download', 'power_bi', 'financial_model']).default('download'),
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
  catchment: z.enum([...UNIVERSITIES, 'all']).default('all'),
  statuses: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  includePersonallyIdentifiableInformation: z.boolean().default(false),
});
export type ReportExportRequestInput = z.infer<typeof reportExportRequestSchema>;
export const verificationExportRequestSchema = reportExportRequestSchema.extend({
  reportType: z.literal('verifications').default('verifications'),
});
export type VerificationExportRequestInput = z.infer<typeof verificationExportRequestSchema>;

export const CATCHMENT_ACCESS_OPTIONS = CATCHMENTS;
