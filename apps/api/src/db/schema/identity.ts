import { boolean, date, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { catchment, kycStatus, opsTeam, university, userRole, userStatus } from './enums';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: text('phone').unique(),
  email: text('email').unique(), // ops/admin only; phone signups get a deterministic placeholder
  role: userRole('role').notNull(),
  status: userStatus('status').notNull().default('pending'),
  // Secondary lookup key linking to this user's Logto identity, populated
  // lazily via JIT provisioning at first Logto sign-in (0033_logto_migration).
  // users.id stays the authoritative primary key everywhere — this column
  // exists only so the auth callback can find the right row by `sub`.
  logtoUserId: text('logto_user_id').unique(),
  // `name`/`emailVerified`/`image`/`phoneVerified` originated as Better Auth
  // columns (0002); kept as-is post-migration since particulars.ts,
  // me.controller.ts, staff.service.ts, etc. all read them — only who
  // writes them changed (Logto's provisioned profile data now, via
  // ProvisioningService, instead of Better Auth's Drizzle adapter).
  name: text('name').notNull().default(''),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  phoneVerified: boolean('phone_verified').notNull().default(false),
  dateOfBirth: date('date_of_birth'),
  gender: text('gender'),
  nationality: text('nationality'),
  address: text('address'),
  emergencyContactName: text('emergency_contact_name'),
  emergencyContactPhone: text('emergency_contact_phone'),
  notes: text('notes'),
  // Admin "delete" is deliberately recoverable: identity and audit history
  // remain intact while all sessions and active access grants are revoked.
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletionReason: text('deletion_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const students = pgTable('students', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  university: university('university').notNull(),
  yearOfStudy: smallint('year_of_study'), // CHECK 1–6 added in SQL migration
  nationalIdHash: text('national_id_hash'), // sha256, optional
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const landlords = pgTable('landlords', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  legalName: text('legal_name').notNull(),
  kycStatus: kycStatus('kyc_status').notNull().default('pending'),
  idDocStorageKey: text('id_doc_storage_key'), // private storage, signed URLs only
  phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
  kycReviewedBy: uuid('kyc_reviewed_by').references(() => users.id),
  kycReviewedAt: timestamp('kyc_reviewed_at', { withTimezone: true }),
  // Landlord & Property Registration Form parity (0025) — mirrors the
  // Google Form's "Landlord/Caretaker Information" section. text + CHECK,
  // not a pgEnum, matching the operational_status precedent for post-hoc
  // ALTER TABLE additions (0013). Deliberately no Identity Verification
  // fields (doc type/number) — landlords are never asked to submit an
  // identity document (privacy decision, product call).
  whatsappNumber: text('whatsapp_number'),
  businessType: text('business_type').notNull().default('individual_landlord'),
  businessTypeOther: text('business_type_other'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const opsStaff = pgTable('ops_staff', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  team: opsTeam('team').notNull(),
  assignedCatchment: catchment('assigned_catchment').notNull().default('MUK'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// This app's own session store (replaces Better Auth's session table it
// grew from — same columns, now written by session.store.ts). accounts/
// verifications/verification_tokens (Better-Auth-owned credential/OTP
// storage) are dropped in 0033_logto_migration.sql — Logto owns all of
// that now.
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
