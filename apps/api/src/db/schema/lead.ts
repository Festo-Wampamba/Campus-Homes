import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './identity';

// A prospective landlord's "Request onboarding" submission from the public
// /landlords page — replaces the old mailto:-only CTA (which left zero
// trace on our side) with a real record Ops can work as a queue, so a
// remote owner who can't easily be visited in person still gets followed up
// on. Distinct from `landlords`/`properties`: this exists before any
// account or property does.
export const onboardingLeads = pgTable('onboarding_leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  propertyLocation: text('property_location').notNull(),
  message: text('message'),
  status: text('status').notNull().default('new'), // 'new' | 'contacted' | 'converted' | 'dismissed'
  contactedBy: uuid('contacted_by').references(() => users.id),
  contactedAt: timestamp('contacted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
