import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './identity';

// Pilot-funnel event backstop (0032): 'search' | 'listing_view' only — see
// the migration for why. actor_id is nullable because both write paths are
// public/unauthenticated routes; RLS scopes INSERT by event_type, not actor.
export const productEvents = pgTable('product_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventType: text('event_type').notNull(),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  payload: jsonb('payload').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
