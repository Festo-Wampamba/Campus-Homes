import { Injectable, NotFoundException } from '@nestjs/common';

import type { CreateManualJournalEntryInput } from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { LedgerService } from './ledger.service';

const SERVICE_CTX: RlsContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'service_role',
};

type JournalEntryRow = {
  id: string;
  entryDate: string;
  memo: string;
  sourceType: string;
  createdByName: string | null;
  lineCount: string;
  totalUgx: string;
};

type JournalLineRow = {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debitUgx: string;
  creditUgx: string;
  memo: string | null;
};

// journal_entries/journal_lines are svc_all + append-only under RLS (0018).
// PermissionsGuard (finance.read/finance.manage) is the real gate.
@Injectable()
export class FinanceJournalService {
  constructor(
    private readonly rlsDb: RlsDb,
    private readonly ledger: LedgerService,
  ) {}

  list(from?: string, to?: string, sourceType?: string) {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (from) {
        params.push(from);
        conditions.push(`je.entry_date >= $${params.length}`);
      }
      if (to) {
        params.push(to);
        conditions.push(`je.entry_date <= $${params.length}`);
      }
      if (sourceType) {
        params.push(sourceType);
        conditions.push(`je.source_type = $${params.length}`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const result = await client.query<JournalEntryRow>(
        `
          SELECT je.id, je.entry_date::text AS "entryDate", je.memo, je.source_type AS "sourceType",
            coalesce(nullif(u.name, ''), u.email) AS "createdByName",
            count(jl.id)::text AS "lineCount",
            coalesce(sum(jl.debit_ugx), 0)::text AS "totalUgx"
          FROM journal_entries je
          LEFT JOIN users u ON u.id = je.created_by
          LEFT JOIN journal_lines jl ON jl.entry_id = je.id
          ${where}
          GROUP BY je.id, u.name, u.email
          ORDER BY je.entry_date DESC, je.created_at DESC
        `,
        params,
      );
      return result.rows;
    });
  }

  detail(id: string) {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const header = await client.query<{
        id: string;
        entryDate: string;
        memo: string;
        sourceType: string;
        reservationId: string | null;
        paymentId: string | null;
        refundId: string | null;
        createdByName: string | null;
        createdAt: string;
      }>(
        `
          SELECT je.id, je.entry_date::text AS "entryDate", je.memo, je.source_type AS "sourceType",
            je.reservation_id AS "reservationId", je.payment_id AS "paymentId", je.refund_id AS "refundId",
            coalesce(nullif(u.name, ''), u.email) AS "createdByName", je.created_at AS "createdAt"
          FROM journal_entries je
          LEFT JOIN users u ON u.id = je.created_by
          WHERE je.id = $1
        `,
        [id],
      );
      const entry = header.rows[0];
      if (!entry) throw new NotFoundException('Journal entry not found');

      const lines = await client.query<JournalLineRow>(
        `
          SELECT jl.id, jl.account_id AS "accountId", a.code AS "accountCode", a.name AS "accountName",
            jl.debit_ugx::text AS "debitUgx", jl.credit_ugx::text AS "creditUgx", jl.memo
          FROM journal_lines jl
          JOIN ledger_accounts a ON a.id = jl.account_id
          WHERE jl.entry_id = $1
          ORDER BY jl.created_at
        `,
        [id],
      );
      return { ...entry, lines: lines.rows };
    });
  }

  async create(ctx: RlsContext, input: CreateManualJournalEntryInput) {
    const id = await this.rlsDb.run(SERVICE_CTX, (db) =>
      this.ledger.postManualEntry(db, {
        memo: input.memo,
        entryDate: input.entryDate,
        createdBy: ctx.userId,
        lines: input.lines.map((line) => ({
          accountId: line.accountId,
          debitUgx: line.debitUgx,
          creditUgx: line.creditUgx,
        })),
      }),
    );
    return this.detail(id);
  }
}
