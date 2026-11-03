import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';
import { properties } from './property';
import { reservations } from './reservation';
export const managementAgencies = pgTable('management_agencies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const managementAgencyMembers = pgTable('management_agency_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  agencyId: uuid('agency_id')
    .notNull()
    .references(() => managementAgencies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  memberRole: text('member_role').notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const propertyManagementMandates = pgTable('property_management_mandates', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  landlordId: uuid('landlord_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  managerId: uuid('manager_id').references(() => users.id, { onDelete: 'cascade' }),
  agencyId: uuid('agency_id').references(() => managementAgencies.id, { onDelete: 'cascade' }),
  capabilities: text('capabilities').array().notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('pending'),
  reason: text('reason').notNull(),
  acceptedBy: uuid('accepted_by').references(() => users.id, { onDelete: 'set null' }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const managementAssignments = pgTable('management_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  mandateId: uuid('mandate_id')
    .notNull()
    .references(() => propertyManagementMandates.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  capabilities: text('capabilities').array().notNull(),
  assignedBy: uuid('assigned_by').references(() => users.id, { onDelete: 'set null' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const managementNotes = pgTable('management_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  status: text('status').notNull().default('open'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const officeCases = pgTable('office_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(),
  subject: text('subject').notNull(),
  customerName: text('customer_name').notNull(),
  reservationId: uuid('reservation_id').references(() => reservations.id, { onDelete: 'set null' }),
  contact: text('contact').notNull().default(''),
  notes: text('notes').notNull().default(''),
  catchment: text('catchment').notNull(),
  status: text('status').notNull().default('open'),
  assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
