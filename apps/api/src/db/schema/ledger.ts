import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { ledgerAccountType } from './enums';
import { users } from './identity';
import { payments, refunds, reservations } from './reservation';

// Lightweight double-entry ledger (0018): chart of accounts + journal
// entries/lines. Hold-fee revenue and refunds auto-post from
// ReservationsService; the finance admin records everything else by hand.
// journal_entries/journal_lines are append-only (GRANT SELECT, INSERT only,
// see migration) — corrections are reversing entries, never edits.
export const ledgerAccounts = pgTable(
  'ledger_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    accountType: ledgerAccountType('account_type').notNull(),
    parentId: uuid('parent_id').references((): AnyPgColumn => ledgerAccounts.id, {
      onDelete: 'restrict',
    }),
    // True only for the seeded accounts the auto-poster depends on — blocks
    // deactivating them out from under it.
    isSystem: boolean('is_system').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('ledger_accounts_code_uk').on(t.code)],
);

export const journalEntries = pgTable('journal_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  entryDate: date('entry_date').notNull().defaultNow(),
  memo: text('memo').notNull(),
  sourceType: text('source_type').notNull().default('manual'), // auto | manual
  reservationId: uuid('reservation_id').references(() => reservations.id, { onDelete: 'restrict' }),
  paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'restrict' }),
  refundId: uuid('refund_id').references(() => refunds.id, { onDelete: 'restrict' }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const journalLines = pgTable(
  'journal_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => journalEntries.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: 'restrict' }),
    debitUgx: integer('debit_ugx').notNull().default(0),
    creditUgx: integer('credit_ugx').notNull().default(0),
    memo: text('memo'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('journal_lines_entry_idx').on(t.entryId),
    index('journal_lines_account_idx').on(t.accountId),
  ],
);
