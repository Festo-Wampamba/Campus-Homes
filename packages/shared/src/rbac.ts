import { z } from 'zod';

import { ugPhone } from './common.js';
import { CATCHMENTS, STAFF_ROLE_KEYS } from './enums.js';

const grantRoleFieldsSchema = z.object({
  roleKey: z.enum(STAFF_ROLE_KEYS),
  scopeType: z.enum(['platform_wide', 'catchment']),
  scopeId: z.enum(CATCHMENTS).optional(),
  validUntil: z.iso.datetime().optional(),
});

export const grantRoleSchema = grantRoleFieldsSchema
  .extend({ reason: z.string().min(1).max(500) })
  .refine((v) => v.scopeType === 'platform_wide' || v.scopeId !== undefined, {
    message: 'scopeId is required when scopeType is catchment',
    path: ['scopeId'],
  });
export type GrantRoleInput = z.infer<typeof grantRoleSchema>;

export const inviteStaffSchema = grantRoleFieldsSchema
  .extend({
    name: z.string().min(1).max(200),
    email: z.email().optional(),
    phone: ugPhone.optional(),
    reason: z.string().min(1).max(500),
  })
  .refine((v) => v.scopeType === 'platform_wide' || v.scopeId !== undefined, {
    message: 'scopeId is required when scopeType is catchment',
    path: ['scopeId'],
  })
  .refine((v) => v.email !== undefined || v.phone !== undefined, {
    message: 'email or phone is required',
    path: ['email'],
  });
export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;

export const updateRolePermissionsSchema = z.object({
  permissionKeys: z.array(z.string().min(1).max(100)).max(200),
});
export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>;
