import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './identity';

// A personal task/reminder calendar, one row per event, owned by whichever
// user created it — not scoped to a property or role. Deliberately smaller
// than the `calendar.manage_owned`/`calendar.manage_assigned`/`calendar.read_own`
// permission catalog seeded in 0013 (that anticipates a shared per-property
// crew calendar); this ships the personal calendar every portal's dashboard
// is missing today, gated on ownership rather than those permissions.
export const calendarEvents = pgTable('calendar_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  eventType: text('event_type').notNull().default('task'), // task | reminder | activity
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  allDay: boolean('all_day').notNull().default(false),
  done: boolean('done').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
