import type { Metadata } from "next";
import type { ProfitLossReport } from "@campushomes/shared";

import { adminFieldClass } from "@/components/admin/admin-modal";
import { Freshness, PageHeader, SectionCard } from "@/components/admin/admin-ui";
import { FinanceTabs } from "@/components/admin/finance/finance-tabs";
import { apiServer } from "@/lib/server-api";

export const metadata: Metadata = { title: "Profit & Loss" };

function ugx(value: number) {
  return new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", maximumFractionDigits: 0 }).format(value);
}

function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

function StatementTable({ title, rows, total }: { title: string; rows: { accountCode: string; accountName: string; amountUgx: number }[]; total: number }) {
  return (
    <div>
      <p className="mb-2 px-4 pt-4 text-xs font-bold uppercase tracking-[0.06em] text-slate-500 dark:text-muted-foreground sm:px-5">{title}</p>
      <table className="w-full text-left text-sm">
        <tbody className="divide-y divide-slate-100 dark:divide-border">
          {rows.map((row) => (
            <tr key={row.accountCode}>
              <td className="px-4 py-2.5 text-slate-600 dark:text-muted-foreground sm:px-5">{row.accountCode} · {row.accountName}</td>
              <td className="tabular px-4 py-2.5 text-right font-semibold text-slate-900 dark:text-foreground sm:px-5">{ugx(row.amountUgx)}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr><td colSpan={2} className="px-4 py-6 text-center text-slate-400 sm:px-5">No activity in this range.</td></tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 dark:border-border">
            <td className="px-4 py-3 text-sm font-bold text-slate-900 dark:text-foreground sm:px-5">Total {title.toLowerCase()}</td>
            <td className="tabular px-4 py-3 text-right text-sm font-bold text-slate-900 dark:text-foreground sm:px-5">{ugx(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default async function ProfitLossPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const params = await searchParams;
  const defaults = defaultRange();
  const from = params.from || defaults.from;
  const to = params.to || defaults.to;
  const report = await apiServer<ProfitLossReport>(`/admin/finance/reports/profit-loss?from=${from}&to=${to}`);

  return (
    <>
      <PageHeader eyebrow="Finance" title="Profit & loss" description="Revenue and expenses recognized in the ledger over the selected period." />
      <FinanceTabs />

      <form method="GET" className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-border dark:bg-card">
        <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-foreground">From</span><input type="date" name="from" defaultValue={from} className={adminFieldClass} /></label>
        <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-foreground">To</span><input type="date" name="to" defaultValue={to} className={adminFieldClass} /></label>
        <button type="submit" className="h-10 rounded-lg bg-teal-600 px-4 text-sm font-bold text-white transition-colors hover:bg-teal-700">Apply</button>
      </form>

      {!report ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">Could not load the profit &amp; loss report.</div>
      ) : (
        <SectionCard title={`${from} → ${to}`} description="Every revenue and expense account with journal activity in this period">
          <StatementTable title="Revenue" rows={report.revenue} total={report.totalRevenueUgx} />
          <div className="border-t border-slate-100 dark:border-border"><StatementTable title="Expenses" rows={report.expenses} total={report.totalExpensesUgx} /></div>
          <div className="flex items-center justify-between border-t-2 border-slate-200 px-4 py-4 dark:border-border sm:px-5">
            <span className="text-sm font-bold text-slate-900 dark:text-foreground">Net income</span>
            <span className={`tabular text-lg font-bold ${report.netIncomeUgx >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>{ugx(report.netIncomeUgx)}</span>
          </div>
          <div className="px-4 pb-4 sm:px-5"><Freshness asOf={report.asOf} /></div>
        </SectionCard>
      )}
    </>
  );
}
