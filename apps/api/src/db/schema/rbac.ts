import { sql } from 'drizzle-orm';
import {
  boolean,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './identity';

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  isSystem: boolean('is_system').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const permissions = pgTable('permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(), // 'resource.action', e.g. 'kyc_documents.read'
  description: text('description').notNull(),
  requiresStepUp: boolean('requires_step_up').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const userRoleAssignments = pgTable(
  'user_role_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    // 'platform_wide' | 'catchment' — free-form, not a pgEnum: adding a scope
    // type later (university/region/assigned_case/...) needs no migration.
    scopeType: text('scope_type').notNull(),
    scopeId: text('scope_id'), // catchment value when scopeType='catchment', else null
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    assignedBy: uuid('assigned_by')
      .notNull()
      .references(() => users.id),
    reason: text('reason').notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('user_role_assignments_active_uk')
      .on(t.userId, t.roleId, t.scopeType, t.scopeId)
      .where(sql`revoked_at IS NULL`),
  ],
);

// Schema only, no consumer yet in this phase — see design doc "Explicitly deferred".
export const approvalRequests = pgTable('approval_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  requestType: text('request_type').notNull(),
  requestedBy: uuid('requested_by')
    .notNull()
    .references(() => users.id),
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id'),
  payload: jsonb('payload').notNull().default({}),
  status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'rejected'
  decidedBy: uuid('decided_by').references(() => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
