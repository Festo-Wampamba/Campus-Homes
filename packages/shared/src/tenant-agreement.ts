import { z } from 'zod';

import { uuid } from './common.js';

// 'heading'/'paragraph' = static content the landlord writes (not fillable)
// — a section title vs. body text/terms, same distinction a real document
// has. 'fill_in' = a blank the student types into; 'multiple_choice' =
// single-select bullets; 'checkboxes' = multi-select. Signature is
// deliberately not a field type — every submission always ends with one
// (drawn or typed), so it isn't something the landlord configures per
// template.
export const TENANT_AGREEMENT_FIELD_TYPES = [
  'heading',
  'paragraph',
  'fill_in',
  'multiple_choice',
  'checkboxes',
] as const;
export type TenantAgreementFieldType = (typeof TENANT_AGREEMENT_FIELD_TYPES)[number];

const CHOICE_FIELD_TYPES = new Set<TenantAgreementFieldType>(['multiple_choice', 'checkboxes']);
// Not student-fillable — no response is ever collected for these, so they're
// also never "required" in the submit-validation sense. Exported so the
// service's required-field check and the frontend renderer share one
// definition instead of redefining "which types are static" twice.
export const STATIC_TENANT_AGREEMENT_FIELD_TYPES = new Set<TenantAgreementFieldType>(['heading', 'paragraph']);

// ── Template builder (landlord / assigned custodian) ────────────────────────

export const tenantAgreementFieldInputSchema = z
  .object({
    fieldType: z.enum(TENANT_AGREEMENT_FIELD_TYPES),
    // Doubles as the block's own text for 'heading'/'paragraph' fields and
    // the question text for every other type — max is generous for a
    // landlord pasting a full terms paragraph into a 'paragraph' block.
    label: z.string().trim().min(1).max(2000),
    options: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
    required: z.boolean().default(false),
  })
  .refine((f) => !CHOICE_FIELD_TYPES.has(f.fieldType) || (f.options?.length ?? 0) >= 2, {
    message: 'Multiple choice and checkbox fields need at least 2 options',
    path: ['options'],
  });
export type TenantAgreementFieldInput = z.infer<typeof tenantAgreementFieldInputSchema>;

export const saveTenantAgreementTemplateSchema = z.object({
  title: z.string().trim().min(1).max(200).default('Tenant Agreement'),
  fields: z.array(tenantAgreementFieldInputSchema).min(1).max(50),
});
export type SaveTenantAgreementTemplateInput = z.infer<typeof saveTenantAgreementTemplateSchema>;

export const tenantAgreementFieldSchema = z.object({
  id: uuid,
  fieldType: z.enum(TENANT_AGREEMENT_FIELD_TYPES),
  label: z.string(),
  options: z.array(z.string()).nullable(),
  required: z.boolean(),
  position: z.number().int(),
});
export type TenantAgreementField = z.infer<typeof tenantAgreementFieldSchema>;

export const tenantAgreementTemplateSchema = z.object({
  id: uuid,
  propertyId: uuid,
  title: z.string(),
  fields: z.array(tenantAgreementFieldSchema),
});
export type TenantAgreementTemplate = z.infer<typeof tenantAgreementTemplateSchema>;

// ── Submission (student) ─────────────────────────────────────────────────────

export const submitTenantAgreementSchema = z.object({
  propertyId: uuid,
  responses: z
    .array(
      z.object({
        fieldId: uuid,
        value: z.union([z.string().trim().min(1).max(5000), z.array(z.string().max(200)).max(20)]),
      }),
    )
    .max(50),
  signature: z.discriminatedUnion('type', [
    z.object({ type: z.literal('typed'), signedName: z.string().trim().min(2).max(200) }),
    // Cloudinary public id — the drawn signature is uploaded the same way
    // every other image in the app is (direct-to-Cloudinary, signed upload).
    z.object({ type: z.literal('drawn'), signatureStorageKey: z.string().trim().min(1) }),
  ]),
});
export type SubmitTenantAgreementInput = z.infer<typeof submitTenantAgreementSchema>;

export const tenantAgreementResponseAnswerSchema = z.object({
  fieldId: uuid,
  label: z.string(),
  fieldType: z.string(),
  value: z.union([z.string(), z.array(z.string())]),
});
export type TenantAgreementResponseAnswer = z.infer<typeof tenantAgreementResponseAnswerSchema>;

export const tenantAgreementSchema = z.object({
  id: uuid,
  templateId: uuid,
  propertyId: uuid,
  studentId: uuid,
  responses: z.array(tenantAgreementResponseAnswerSchema),
  signatureType: z.enum(['typed', 'drawn']),
  signedName: z.string().nullable(),
  signatureStorageKey: z.string().nullable(),
  submittedAt: z.string(),
});
export type TenantAgreement = z.infer<typeof tenantAgreementSchema>;

// The landlord/custodian submissions list — GET /tenant-agreements/property/:id
// (raw SQL row, snake_case like listingSearchResultSchema, joined with the
// signer's account name since a self-typed signature isn't always reliable).
export const tenantAgreementForPropertyRowSchema = z.object({
  id: uuid,
  template_id: uuid,
  property_id: uuid,
  student_id: uuid,
  student_name: z.string().nullable(),
  responses: z.array(tenantAgreementResponseAnswerSchema),
  signature_type: z.enum(['typed', 'drawn']),
  signed_name: z.string().nullable(),
  signature_storage_key: z.string().nullable(),
  submitted_at: z.string(),
});
export type TenantAgreementForPropertyRow = z.infer<typeof tenantAgreementForPropertyRowSchema>;
