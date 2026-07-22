import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './identity';

export const platformSettings = pgTable('platform_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  description: text('description').notNull(),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const platformIntegrations = pgTable('platform_integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  purpose: text('purpose').notNull(),
  category: text('category').notNull(),
  audience: text('audience').notNull().default('internal'),
  baseUrl: text('base_url'),
  enabled: boolean('enabled').notNull().default(false),
  isSystem: boolean('is_system').notNull().default(false),
  config: jsonb('config').notNull().default({}),
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const reportExports = pgTable('report_exports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reportType: text('report_type').notNull(),
  format: text('format').notNull(),
  destination: text('destination').notNull().default('download'),
  filters: jsonb('filters').notNull().default({}),
  status: text('status').notNull().default('completed'),
  fileName: text('file_name'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  error: text('error'),
});
