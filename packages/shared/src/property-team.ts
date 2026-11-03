import { z } from 'zod';
import { WORKER_TYPES } from './enums.js';

export const propertyTeamAssignmentSchema = z.object({
  propertyId: z.uuid(),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: z.enum(['custodian', 'property_worker']),
  workerType: z.enum(WORKER_TYPES).optional(),
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
  ownerName: string | null;
  contactPhone: string | null;
}
