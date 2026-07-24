import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './identity';

// The staff-facing counterpart to calendar_events (0016): a shared activity
// board admin/ops create, assign to any staff member, and track through
// status. Gated by activities.manage/activities.read (0017) rather than the
// calendar.manage_owned/manage_assigned/read_own catalog from 0013 — those
// are property-ownership scoped (landlord/custodian/property_worker) and
// don't fit "assign to any staff member" semantics. RLS is svc_all-only,
// same posture as roles/staff — PermissionsGuard is the real gate.
export const activities = pgTable('activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  activityType: text('activity_type').notNull().default('task'), // task | meeting | visit | maintenance | other
  status: text('status').notNull().default('pending'), // pending | in_progress | done | cancelled
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  allDay: boolean('all_day').notNull().default(false),
  assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
