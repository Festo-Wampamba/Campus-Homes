import { pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';

import { students } from './identity';
import { listings } from './listing';

// A student's favourited listings. Composite PK doubles as the natural
// uniqueness guard (save is idempotent — ON CONFLICT DO NOTHING).
export const savedListings = pgTable(
  'saved_listings',
  {
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.userId, { onDelete: 'cascade' }),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.listingId] })],
);
