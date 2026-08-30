import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { listings } from './listing';
import { users } from './identity';

// Student inquiries (0028): a support question submitted from the student
// portal, routed to ops/admin. Owner-scoped like calendar_events — RLS lets
// the student insert/read only their own rows (SELECT/INSERT granted, no
// UPDATE/DELETE); staff read/resolve through service paths gated by
// inquiries.read/inquiries.resolve (PermissionsGuard is the real boundary,
// same posture as activities).
//
// listing_id/landlord_id (0030): an optional listing-scoped enquiry reaches
// the landlord directly instead of only staff. landlord_id is resolved
// server-side from listing_id at insert time — never client-supplied.
// landlord_response/landlord_responded_at are column-grant-restricted (see
// 0030) so a landlord's own UPDATE can never touch status/resolution.
export const inquiries = pgTable('inquiries', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  category: text('category').notNull().default('general'), // general | listing | reservation | payment | safety | other
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  status: text('status').notNull().default('open'), // open | resolved
  resolution: text('resolution'),
  resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  listingId: uuid('listing_id').references(() => listings.id, { onDelete: 'set null' }),
  landlordId: uuid('landlord_id').references(() => users.id, { onDelete: 'set null' }),
  landlordResponse: text('landlord_response'),
  landlordRespondedAt: timestamp('landlord_responded_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
