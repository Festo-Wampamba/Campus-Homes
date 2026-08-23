import { boolean, jsonb, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { properties } from './property';
import { students, users } from './identity';

// QR-code tenant registration, Google-Forms-style: the landlord (or an
// assigned custodian) designs the form themselves — see tenant-agreements
// module for the authorization logic (svc_all RLS, service-layer mediated).
export const tenantAgreementTemplates = pgTable(
  'tenant_agreement_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default('Tenant Agreement'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('tenant_agreement_templates_property_uk').on(t.propertyId)],
);

export const tenantAgreementFields = pgTable(
  'tenant_agreement_fields',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => tenantAgreementTemplates.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
    // 'heading' | 'paragraph' | 'fill_in' | 'multiple_choice' | 'checkboxes'
    // — CHECK in the SQL migration. Not a pgEnum: this isn't part of the
    // design-doc catalog, same precedent as activities.activity_type.
    fieldType: text('field_type').notNull(),
    label: text('label').notNull(),
    options: jsonb('options').$type<string[] | null>(),
    required: boolean('required').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('tenant_agreement_fields_template_position_idx').on(t.templateId, t.position)],
);

export type TenantAgreementResponseAnswer = {
  fieldId: string;
  label: string;
  fieldType: string;
  value: string | string[];
};

export const tenantAgreements = pgTable(
  'tenant_agreements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => tenantAgreementTemplates.id, { onDelete: 'restrict' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.userId, { onDelete: 'restrict' }),
    // Snapshot of the template's fields at submit time — editing the
    // template later never corrupts how an old submission displays.
    responses: jsonb('responses').$type<TenantAgreementResponseAnswer[]>().notNull(),
    // Fixed, platform-wide consent — z.literal(true) on the submit schema
    // means this is always true for any row that made it through validation;
    // stored explicitly anyway so the column is a self-contained audit trail.
    declarationAccepted: boolean('declaration_accepted').notNull().default(false),
    signatureType: text('signature_type').notNull(), // 'typed' | 'drawn'
    signedName: text('signed_name'),
    signatureStorageKey: text('signature_storage_key'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('tenant_agreements_property_student_uk').on(t.propertyId, t.studentId)],
);
