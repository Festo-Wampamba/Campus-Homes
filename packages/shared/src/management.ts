import { z } from 'zod';
import { CATCHMENTS } from './enums.js';

export const MANAGEMENT_CAPABILITIES = [
  'property.read',
  'property.edit',
  'reservations.read',
  'maintenance.manage',
  'notices.manage',
  'finance.read',
  'reports.submit',
  'team.manage',
] as const;
export type ManagementCapability = (typeof MANAGEMENT_CAPABILITIES)[number];
export const MANAGEMENT_CAPABILITY_LABELS: Record<ManagementCapability, string> = {
  'property.read': 'View property and rooms',
  'property.edit': 'Edit description and property contacts',
  'reservations.read': 'View reservations and move-in coordination',
  'maintenance.manage': 'Manage maintenance and incidents',
  'notices.manage': 'Publish property notices',
  'finance.read': 'View property payment statements',
  'reports.submit': 'Submit reports to the landlord',
  'team.manage': 'Assign agency staff to this property',
};
const text = z.string().trim().min(1).max(500);
const capabilities = z
  .array(z.enum(MANAGEMENT_CAPABILITIES))
  .min(1)
  .max(8)
  .refine((v) => new Set(v).size === v.length, 'Remove duplicate permissions')
  .refine((v) => v.includes('property.read'), 'Property read access is required');
export const createAgencySchema = z.object({ name: z.string().trim().min(2).max(150) }).strict();
export const agencyMemberSchema = z.object({ email: z.email() }).strict();
export const createMandateSchema = z
  .object({
    propertyId: z.uuid(),
    managerEmail: z.email().optional(),
    agencyId: z.uuid().optional(),
    capabilities,
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    reason: text,
  })
  .strict()
  .refine((v) => !!v.managerEmail !== !!v.agencyId, 'Choose one individual manager or one agency')
  .refine(
    (v) => Date.parse(v.endsAt) > Date.parse(v.startsAt),
    'End date must follow the start date',
  )
  .refine((v) => Date.parse(v.endsAt) > Date.now(), 'End date must be in the future');
export type CreateMandateInput = z.infer<typeof createMandateSchema>;
export const assignManagerSchema = z.object({ userId: z.uuid(), capabilities }).strict();
export const mandateDecisionSchema = z.object({ decision: z.enum(['accept', 'reject']) }).strict();
export const managementNoteSchema = z
  .object({
    kind: z.enum(['maintenance', 'incident', 'notice', 'report']),
    title: z.string().trim().min(2).max(150),
    body: z.string().trim().min(1).max(5000),
  })
  .strict();
export const managementNoteUpdateSchema = z
  .object({ status: z.enum(['open', 'in_progress', 'resolved']) })
  .strict();
export const managedPropertyUpdateSchema = z
  .object({
    description: z.string().trim().max(5000).optional(),
    contactPhone: z.string().trim().min(7).max(30).optional(),
    contactEmail: z.email().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide a change');
export const officeCaseSchema = z
  .object({
    kind: z.enum(['inquiry', 'onboarding', 'appointment', 'refund_request']),
    subject: z.string().trim().min(2).max(150),
    customerName: z.string().trim().min(2).max(150),
    contact: z.string().trim().max(200).default(''),
    notes: z.string().trim().max(5000).default(''),
    catchment: z.enum(CATCHMENTS).exclude(['all']),
    reservationId: z.uuid().optional(),
    assignedTo: z.uuid().optional(),
    scheduledAt: z.iso.datetime().optional(),
  })
  .strict()
  .refine(
    (v) => v.kind !== 'appointment' || !!v.scheduledAt,
    'An appointment needs a date and time',
  );
export const officeCaseUpdateSchema = z
  .object({
    status: z.enum(['open', 'in_progress', 'escalated', 'closed']),
    notes: z.string().trim().max(5000).optional(),
  })
  .strict();
export const governanceRequestSchema = z
  .object({
    type: z.enum(['expenditure', 'refund_authorisation', 'policy_change', 'senior_appointment']),
    title: z.string().trim().min(2).max(150),
    reason: z.string().trim().min(5).max(5000),
    amountUgx: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .strict()
  .refine(
    (v) => !['expenditure', 'refund_authorisation'].includes(v.type) || v.amountUgx !== undefined,
    'Provide the amount in UGX',
  );
export const governanceDecisionSchema = z
  .object({ decision: z.enum(['approved', 'rejected']), reason: text })
  .strict();
