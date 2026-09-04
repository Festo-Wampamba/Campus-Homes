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

// Starter template offered when a property has no saved form yet — a
// field-for-field match of CampusHomes' original paper/Google-Forms student
// registration form, so a landlord (or ops, under the MVP concierge model)
// starts from something already shaped like what students expect instead of
// a blank page. Deviations from that source form, all deliberate:
// "Date of Registration" and "Date Signed" are dropped (the submission's own
// timestamp already captures this automatically); "Medical Conditions /
// Allergies" is optional rather than required (product decision — still
// important to collect, but shouldn't block submission); "Property / Hostel
// Name" and "Landlord / Caretaker Name/Phone Number" are dropped too — on
// the paper form there's no other way to know which property a submission
// belongs to, but the digital flow always starts from a property-scoped QR
// code (the property name/address is already shown right above this form),
// and the landlord's own contact details live on their account, not
// something the student should have to type in by hand. "Room / Unit
// Number" stays — the digital flow isn't linked to a specific reservation,
// so it's the one piece of context the system genuinely doesn't have yet.
// Declaration and signature are never template fields at all — see
// TENANT_AGREEMENT_DECLARATION_TEXT below and the field-types comment at
// the top of this file. Landlords can still freely edit or remove any of
// these afterward; this is only the pre-filled starting point.
export const DEFAULT_TENANT_AGREEMENT_TEMPLATE_FIELDS: TenantAgreementFieldInput[] = [
  { fieldType: 'heading', label: 'Your Room', required: false },
  { fieldType: 'fill_in', label: 'Room / Unit Number', required: true },
  { fieldType: 'heading', label: 'Student Personal Details', required: false },
  { fieldType: 'fill_in', label: 'Student Full Name', required: true },
  {
    fieldType: 'multiple_choice',
    label: 'Gender',
    options: ['Male', 'Female', 'Prefer not to say'],
    required: true,
  },
  { fieldType: 'fill_in', label: 'Date of Birth (DD/MM/YYYY)', required: true },
  { fieldType: 'fill_in', label: 'National ID / Passport Number', required: false },
  { fieldType: 'fill_in', label: 'Student Phone Number', required: true },
  { fieldType: 'fill_in', label: 'Student Email Address', required: true },
  { fieldType: 'heading', label: 'Academic Details', required: false },
  { fieldType: 'fill_in', label: 'University / Institution Name', required: true },
  { fieldType: 'fill_in', label: 'Student Registration / ID Number', required: true },
  { fieldType: 'fill_in', label: 'Course / Programme of Study', required: true },
  {
    fieldType: 'multiple_choice',
    label: 'Year of Study',
    options: ['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5+'],
    required: true,
  },
  { fieldType: 'fill_in', label: 'Parent / Guardian Phone Number', required: true },
  { fieldType: 'fill_in', label: 'Parent / Guardian Name(s)', required: true },
  { fieldType: 'heading', label: 'Next of Kin', required: false },
  {
    fieldType: 'multiple_choice',
    label: 'Relationship to Student',
    options: ['Sibling', 'Relative', 'Guardian', 'Other'],
    required: true,
  },
  {
    fieldType: 'fill_in',
    label: 'Next of Kin Phone Number / WhatsApp Number / Location / Address',
    required: true,
  },
  { fieldType: 'heading', label: 'Tenancy & Welfare', required: false },
  { fieldType: 'fill_in', label: 'Move-in Date (DD/MM/YYYY)', required: true },
  { fieldType: 'fill_in', label: 'Agreed Rent Amount', required: true },
  {
    fieldType: 'multiple_choice',
    label: 'Agreed Rent Frequency',
    options: ['Monthly', 'Per Semester', 'Annually', 'Termly'],
    required: true,
  },
  { fieldType: 'fill_in', label: 'Medical Conditions / Allergies', required: false },
  { fieldType: 'fill_in', label: 'Vehicle / Motorcycle Registration Number', required: false },
  { fieldType: 'fill_in', label: 'Additional Notes', required: false },
  { fieldType: 'heading', label: 'Declaration', required: false },
  { fieldType: 'fill_in', label: 'Form Completed By', required: true },
];

// ── Submission (student) ─────────────────────────────────────────────────────

// Fixed, platform-wide wording — not a landlord-configurable template field
// (same precedent as signature, per the field-types comment above: every
// submission always ends with a declaration + signature, so it isn't
// something a landlord can omit or reword for their own property).
export const TENANT_AGREEMENT_DECLARATION_TEXT =
  "I confirm that the information provided in this form is accurate to the best of my knowledge. I consent to CampusHomes and this property's management storing this information in the property database for tenancy management, communication, and emergency-contact purposes. This information will not be sold or commercialised, and will not be shared with third parties outside those purposes.";

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
  // Mandatory on every submission, independent of the landlord's own
  // template fields — z.literal(true) rejects both `false` and a missing
  // value, so there's no way to submit without ticking it.
  declarationAccepted: z.literal(true),
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
  declarationAccepted: z.boolean(),
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
  declaration_accepted: z.boolean(),
  signature_type: z.enum(['typed', 'drawn']),
  signed_name: z.string().nullable(),
  signature_storage_key: z.string().nullable(),
  submitted_at: z.string(),
});
export type TenantAgreementForPropertyRow = z.infer<typeof tenantAgreementForPropertyRowSchema>;
