import { Injectable } from '@nestjs/common';

import type { BalanceSheetReport, ProfitLossReport, RevenueSeriesPoint } from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';

const SERVICE_CTX: RlsContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'service_role',
};

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

type AccountBalanceRow = { accountCode: string; accountName: string; accountType: string; amountUgx: string };

// Reports read journal_entries/journal_lines directly (svc_all under RLS,
// 0018) — PermissionsGuard (finance.read) is the real gate. Balances are
// computed on the fly from journal_lines every call; there is no
// period-close job (see Retained Earnings handling in balanceSheet()).
@Injectable()
export class FinanceReportsService {
  constructor(private readonly rlsDb: RlsDb) {}

  profitLoss(from: string, to: string): Promise<ProfitLossReport> {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const result = await client.query<AccountBalanceRow>(
        `
          SELECT a.code AS "accountCode", a.name AS "accountName", a.account_type AS "accountType",
            (CASE WHEN a.account_type = 'revenue'
              THEN coalesce(t.credit_total, 0) - coalesce(t.debit_total, 0)
              ELSE coalesce(t.debit_total, 0) - coalesce(t.credit_total, 0)
            END)::text AS "amountUgx"
          FROM ledger_accounts a
          LEFT JOIN (
            SELECT jl.account_id, sum(jl.debit_ugx) AS debit_total, sum(jl.credit_ugx) AS credit_total
            FROM journal_lines jl
            JOIN journal_entries je ON je.id = jl.entry_id
            WHERE je.entry_date BETWEEN $1 AND $2
            GROUP BY jl.account_id
          ) t ON t.account_id = a.id
          WHERE a.account_type IN ('revenue', 'expense') AND a.is_active
          ORDER BY a.code
        `,
        [from, to],
      );

      const revenue = result.rows.filter((r) => r.accountType === 'revenue');
      const expenses = result.rows.filter((r) => r.accountType === 'expense');
      const totalRevenueUgx = revenue.reduce((sum, r) => sum + number(r.amountUgx), 0);
      const totalExpensesUgx = expenses.reduce((sum, r) => sum + number(r.amountUgx), 0);
      return {
        from,
        to,
        revenue: revenue.map((r) => ({ accountCode: r.accountCode, accountName: r.accountName, amountUgx: number(r.amountUgx) })),
        expenses: expenses.map((r) => ({ accountCode: r.accountCode, accountName: r.accountName, amountUgx: number(r.amountUgx) })),
        totalRevenueUgx,
        totalExpensesUgx,
        netIncomeUgx: totalRevenueUgx - totalExpensesUgx,
        asOf: new Date().toISOString(),
      };
    });
  }

  balanceSheet(asOf: string): Promise<BalanceSheetReport> {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const result = await client.query<AccountBalanceRow>(
        `
          SELECT a.code AS "accountCode", a.name AS "accountName", a.account_type AS "accountType",
            (CASE WHEN a.account_type = 'asset'
              THEN coalesce(t.debit_total, 0) - coalesce(t.credit_total, 0)
              ELSE coalesce(t.credit_total, 0) - coalesce(t.debit_total, 0)
            END)::text AS "amountUgx"
          FROM ledger_accounts a
          LEFT JOIN (
            SELECT jl.account_id, sum(jl.debit_ugx) AS debit_total, sum(jl.credit_ugx) AS credit_total
            FROM journal_lines jl
            JOIN journal_entries je ON je.id = jl.entry_id
            WHERE je.entry_date <= $1
            GROUP BY jl.account_id
          ) t ON t.account_id = a.id
          WHERE a.account_type IN ('asset', 'liability', 'equity') AND a.is_active
          ORDER BY a.code
        `,
        [asOf],
      );

      // Retained Earnings (3000, is_system) is synthetic — no period-close
      // job posts to it directly, so its "real" journal balance is always
      // zero. Override it with cumulative net income to asOf, computed the
      // same way profitLoss() computes net income. Any OTHER equity account
      // (a future manually-created one with real postings) keeps its real
      // journal-derived balance untouched.
      const netIncome = await client.query<{ netIncomeUgx: string }>(
        `
          SELECT coalesce(sum(jl.credit_ugx - jl.debit_ugx), 0)::text AS "netIncomeUgx"
          FROM journal_lines jl
          JOIN journal_entries je ON je.id = jl.entry_id
          JOIN ledger_accounts a ON a.id = jl.account_id
          WHERE je.entry_date <= $1 AND a.account_type IN ('revenue', 'expense')
        `,
        [asOf],
      );
      const netIncomeUgx = number(netIncome.rows[0]?.netIncomeUgx);

      const assets = result.rows.filter((r) => r.accountType === 'asset');
      const liabilities = result.rows.filter((r) => r.accountType === 'liability');
      const equity = result.rows
        .filter((r) => r.accountType === 'equity')
        .map((r) => (r.accountCode === '3000' ? { ...r, amountUgx: String(netIncomeUgx) } : r));

      const assetsTotalUgx = assets.reduce((sum, r) => sum + number(r.amountUgx), 0);
      const liabilitiesTotalUgx = liabilities.reduce((sum, r) => sum + number(r.amountUgx), 0);
      const equityTotalUgx = equity.reduce((sum, r) => sum + number(r.amountUgx), 0);

      const line = (r: AccountBalanceRow) => ({
        accountCode: r.accountCode,
        accountName: r.accountName,
        amountUgx: number(r.amountUgx),
      });

      return {
        asOf,
        assets: assets.map(line),
        liabilities: liabilities.map(line),
        equity: equity.map(line),
        assetsTotalUgx,
        liabilitiesTotalUgx,
        equityTotalUgx,
        meta: { balanced: assetsTotalUgx === liabilitiesTotalUgx + equityTotalUgx },
      };
    });
  }

  revenueSeries(from: string, to: string): Promise<RevenueSeriesPoint[]> {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const result = await client.query<{ period: string; holdFeeRevenueUgx: string; refundsUgx: string }>(
        `
          WITH months AS (
            SELECT generate_series(date_trunc('month', $1::date), date_trunc('month', $2::date), interval '1 month') AS month
          )
          SELECT to_char(m.month, 'Mon YYYY') AS period,
            coalesce((
              SELECT sum(jl.credit_ugx - jl.debit_ugx)
              FROM journal_lines jl
              JOIN journal_entries je ON je.id = jl.entry_id
              JOIN ledger_accounts a ON a.id = jl.account_id
              WHERE a.code = '4000' AND je.entry_date >= m.month AND je.entry_date < m.month + interval '1 month'
            ), 0)::text AS "holdFeeRevenueUgx",
            coalesce((
              SELECT sum(jl.debit_ugx - jl.credit_ugx)
              FROM journal_lines jl
              JOIN journal_entries je ON je.id = jl.entry_id
              JOIN ledger_accounts a ON a.id = jl.account_id
              WHERE a.code = '4900' AND je.entry_date >= m.month AND je.entry_date < m.month + interval '1 month'
            ), 0)::text AS "refundsUgx"
          FROM months m ORDER BY m.month
        `,
        [from, to],
      );
      return result.rows.map((row) => {
        const holdFeeRevenueUgx = number(row.holdFeeRevenueUgx);
        const refundsUgx = number(row.refundsUgx);
        return { period: row.period, holdFeeRevenueUgx, refundsUgx, netRevenueUgx: holdFeeRevenueUgx - refundsUgx };
      });
    });
  }
}
