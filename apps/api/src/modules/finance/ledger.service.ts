import { Injectable, NotFoundException } from '@nestjs/common';
import { inArray } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { journalEntries, journalLines, ledgerAccounts } from '../../db/schema';

type LineInput = { accountId: string; debitUgx: number; creditUgx: number };

/**
 * The one write path into journal_entries/journal_lines (0018). Both
 * postAutoEntry and postManualEntry take the caller's already-open `db`
 * handle rather than opening their own transaction, so an auto-posted entry
 * commits-or-rolls-back atomically with the payment/refund row it documents
 * (ReservationsService), and a manual entry does the same with its own
 * RlsDb.run wrapper (FinanceJournalService). The DB's own deferred balance
 * trigger (0018) is the backstop if this ever posts something unbalanced.
 */
@Injectable()
export class LedgerService {
  async postAutoEntry(
    db: Db,
    opts: {
      memo: string;
      reservationId?: string;
      paymentId?: string;
      refundId?: string;
      lines: { accountCode: string; debitUgx?: number; creditUgx?: number }[];
    },
  ): Promise<string> {
    const codes = [...new Set(opts.lines.map((line) => line.accountCode))];
    const accounts = await db
      .select({ id: ledgerAccounts.id, code: ledgerAccounts.code })
      .from(ledgerAccounts)
      .where(inArray(ledgerAccounts.code, codes));
    const idByCode = new Map(accounts.map((a) => [a.code, a.id]));

    const lines: LineInput[] = opts.lines.map((line) => {
      const accountId = idByCode.get(line.accountCode);
      if (!accountId) throw new NotFoundException(`Unknown ledger account code ${line.accountCode}`);
      return { accountId, debitUgx: line.debitUgx ?? 0, creditUgx: line.creditUgx ?? 0 };
    });

    return this.insertEntry(db, {
      memo: opts.memo,
      sourceType: 'auto',
      reservationId: opts.reservationId ?? null,
      paymentId: opts.paymentId ?? null,
      refundId: opts.refundId ?? null,
      createdBy: null,
      lines,
    });
  }

  async postManualEntry(
    db: Db,
    opts: { memo: string; entryDate: string; createdBy: string; lines: LineInput[] },
  ): Promise<string> {
    return this.insertEntry(db, {
      memo: opts.memo,
      entryDate: opts.entryDate,
      sourceType: 'manual',
      createdBy: opts.createdBy,
      lines: opts.lines,
    });
  }

  private async insertEntry(
    db: Db,
    opts: {
      memo: string;
      sourceType: 'auto' | 'manual';
      entryDate?: string;
      reservationId?: string | null;
      paymentId?: string | null;
      refundId?: string | null;
      createdBy: string | null;
      lines: LineInput[];
    },
  ): Promise<string> {
    const [entry] = await db
      .insert(journalEntries)
      .values({
        entryDate: opts.entryDate ?? new Date().toISOString().slice(0, 10),
        memo: opts.memo,
        sourceType: opts.sourceType,
        reservationId: opts.reservationId ?? null,
        paymentId: opts.paymentId ?? null,
        refundId: opts.refundId ?? null,
        createdBy: opts.createdBy,
      })
      .returning({ id: journalEntries.id });
    if (!entry) throw new NotFoundException('Journal entry could not be created');

    await db.insert(journalLines).values(
      opts.lines.map((line) => ({
        entryId: entry.id,
        accountId: line.accountId,
        debitUgx: line.debitUgx,
        creditUgx: line.creditUgx,
      })),
    );
    return entry.id;
  }
}
