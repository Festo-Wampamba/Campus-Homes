import { z } from 'zod';
import { WORKER_TYPES } from './enums.js';

// What the landlord lets each custodian or worker do at their property
// (Festo, 2026-11-05). Mirrors the CHECK in migration 0086.
export const TEAM_CAPABILITIES = ['bookings.manage', 'payments.record', 'students.view', 'agreements.manage'] as const;
export type TeamCapability = (typeof TEAM_CAPABILITIES)[number];
export const TEAM_CAPABILITY_LABELS: Record<TeamCapability, string> = {
  'bookings.manage': 'Confirm bookings, walk-ins, releases and move-ins',
  'payments.record': 'Record rent payments',
  'students.view': "See students' contact details",
  'agreements.manage': 'Manage the tenant agreement and its submissions',
};
// A custodian keeps everything custodians could always do; a worker starts with none.
export const DEFAULT_TEAM_CAPABILITIES: Record<'custodian' | 'property_worker', TeamCapability[]> = {
  custodian: [...TEAM_CAPABILITIES],
  property_worker: [],
};
const teamCapabilities = z.array(z.enum(TEAM_CAPABILITIES)).max(TEAM_CAPABILITIES.length)
  .refine((v) => new Set(v).size === v.length, 'Remove duplicate permissions');

export const propertyTeamCapabilitiesSchema = z.object({ capabilities: teamCapabilities }).strict();
export type PropertyTeamCapabilitiesInput = z.infer<typeof propertyTeamCapabilitiesSchema>;

export const propertyTeamAssignmentSchema = z.object({
  propertyId: z.uuid(),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: z.enum(['custodian', 'property_worker']),
  workerType: z.enum(WORKER_TYPES).optional(),
  // Omitted = the role's defaults.
  capabilities: teamCapabilities.optional(),
  reason: z.string().trim().min(3).max(500),
}).strict().superRefine((input, ctx) => {
  if (input.role === 'property_worker' && !input.workerType)
    ctx.addIssue({ code: 'custom', path: ['workerType'], message: 'Choose the worker’s duties' });
  if (input.role === 'custodian' && input.workerType)
    ctx.addIssue({ code: 'custom', path: ['workerType'], message: 'Worker duties apply only to property workers' });
});
export type PropertyTeamAssignmentInput = z.infer<typeof propertyTeamAssignmentSchema>;

export interface PropertyTeamMember {
  id: string;
  propertyId: string;
  propertyName: string;
  name: string | null;
  email: string | null;
  role: 'custodian' | 'property_worker';
  workerType: string | null;
  capabilities: TeamCapability[];
  status: string;
  startsAt: string;
}
export interface OwnerPropertyTeam {
  properties: { id: string; name: string }[];
  members: PropertyTeamMember[];
}
export interface AssignedProperty {
  id: string;
  propertyId: string;
  name: string;
  streetAddress: string;
  role: 'custodian' | 'property_worker';
  workerType: string | null;
  capabilities: TeamCapability[];
  ownerName: string | null;
  contactPhone: string | null;
}
