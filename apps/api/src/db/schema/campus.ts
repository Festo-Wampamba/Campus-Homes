import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { university } from './enums';
import { users } from './identity';

// One photo per university tile on the public landing page — Ops-uploaded,
// public-read. Not a "universities" entity (there isn't one); just a small
// reference table keyed on the same enum students/properties already use.
export const campusPhotos = pgTable('campus_photos', {
  university: university('university').primaryKey(),
  storageKey: text('storage_key').notNull(),
  uploadedBy: uuid('uploaded_by')
    .notNull()
    .references(() => users.id),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});
