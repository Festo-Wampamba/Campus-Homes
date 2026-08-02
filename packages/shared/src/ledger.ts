import { z } from 'zod';

import { uuid } from './common.js';
import { LEDGER_ACCOUNT_TYPES, type LedgerAccountType } from './enums.js';

export const createLedgerAccountSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(200),
  accountType: z.enum(LEDGER_ACCOUNT_TYPES),
  parentId: uuid.nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
});
export type CreateLedgerAccountInput = z.infer<typeof createLedgerAccountSchema>;

// code/accountType are immutable after creation (protects historical report
// math) — only name/description/isActive can change post-creation.
export const updateLedgerAccountSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateLedgerAccountInput = z.infer<typeof updateLedgerAccountSchema>;

export type LedgerAccount = {
  id: string;
  code: string;
  name: string;
  accountType: LedgerAccountType;
  parentId: string | null;
  isSystem: boolean;
  isActive: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

const journalLineInput = z.object({
  accountId: uuid,
  debitUgx: z.number().int().nonnegative().default(0),
  creditUgx: z.number().int().nonnegative().default(0),
});

// A fast, friendly 400 in front of the DB's own deferred balance trigger:
// every line is exactly one side, and the entry nets to zero.
export const createManualJournalEntrySchema = z
  .object({
    entryDate: z.iso.date(),
    memo: z.string().trim().min(1).max(500),
    lines: z.array(journalLineInput).min(2),
  })
  .refine(
    (input) => input.lines.every((line) => (line.debitUgx > 0) !== (line.creditUgx > 0)),
    { message: 'Each line must have exactly one of debitUgx or creditUgx greater than zero' },
  )
  .refine(
    (input) => {
      const debits = input.lines.reduce((sum, line) => sum + line.debitUgx, 0);
      const credits = input.lines.reduce((sum, line) => sum + line.creditUgx, 0);
      return debits === credits;
    },
    { message: 'Total debits must equal total credits' },
  );
export type CreateManualJournalEntryInput = z.infer<typeof createManualJournalEntrySchema>;

export type JournalLine = {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debitUgx: number;
  creditUgx: number;
  memo: string | null;
};

export type JournalEntry = {
  id: string;
  entryDate: string;
  memo: string;
  sourceType: 'auto' | 'manual';
  reservationId: string | null;
  paymentId: string | null;
  refundId: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  lines: JournalLine[];
  totalUgx: number;
};

export type ProfitLossLine = { accountCode: string; accountName: string; amountUgx: number };
export type ProfitLossReport = {
  from: string;
  to: string;
  revenue: ProfitLossLine[];
  expenses: ProfitLossLine[];
  totalRevenueUgx: number;
  totalExpensesUgx: number;
  netIncomeUgx: number;
  asOf: string;
};

export type BalanceSheetLine = { accountCode: string; accountName: string; amountUgx: number };
export type BalanceSheetReport = {
  asOf: string;
  assets: BalanceSheetLine[];
  liabilities: BalanceSheetLine[];
  equity: BalanceSheetLine[];
  assetsTotalUgx: number;
  liabilitiesTotalUgx: number;
  equityTotalUgx: number;
  meta: { balanced: boolean };
};

export type RevenueSeriesPoint = {
  period: string;
  holdFeeRevenueUgx: number;
  refundsUgx: number;
  netRevenueUgx: number;
};
