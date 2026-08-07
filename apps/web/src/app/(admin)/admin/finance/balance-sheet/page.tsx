import type { Metadata } from "next";
import type { BalanceSheetReport } from "@campushomes/shared";
import { AlertTriangle } from "lucide-react";

import { adminFieldClass } from "@/components/admin/admin-modal";
import { PageHeader, SectionCard } from "@/components/admin/admin-ui";
import { FinanceTabs } from "@/components/admin/finance/finance-tabs";
import { apiServer } from "@/lib/server-api";

export const metadata: Metadata = { title: "Balance Sheet" };

function ugx(value: number) {
  return new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", maximumFractionDigits: 0 }).format(value);
}

function StatementSection({ title, rows, total }: { title: string; rows: { accountCode: string; accountName: string; amountUgx: number }[]; total: number }) {
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
            <tr><td colSpan={2} className="px-4 py-6 text-center text-slate-400 sm:px-5">No accounts of this type yet.</td></tr>
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

export default async function BalanceSheetPage({ searchParams }: { searchParams: Promise<{ asOf?: string }> }) {
  const params = await searchParams;
  const asOf = params.asOf || new Date().toISOString().slice(0, 10);
  const sheet = await apiServer<BalanceSheetReport>(`/admin/finance/reports/balance-sheet?asOf=${asOf}`);

  return (
    <>
      <PageHeader eyebrow="Finance" title="Balance sheet" description="Assets, liabilities, and equity as of a point in time." />
      <FinanceTabs />

      <form method="GET" className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-border dark:bg-card">
        <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-foreground">As of</span><input type="date" name="asOf" defaultValue={asOf} className={adminFieldClass} /></label>
        <button type="submit" className="h-10 rounded-lg bg-teal-600 px-4 text-sm font-bold text-white transition-colors hover:bg-teal-700">Apply</button>
      </form>

      {!sheet ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">Could not load the balance sheet.</div>
      ) : (
        <SectionCard
          title={`As of ${asOf}`}
          description="Assets on the left invariant; liabilities plus equity on the right — they always match"
          action={!sheet.meta.balanced && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
              <AlertTriangle aria-hidden className="size-3.5" />Out of balance
            </span>
          )}
        >
          <div className="grid gap-0 lg:grid-cols-2 lg:divide-x lg:divide-slate-100 dark:lg:divide-border">
            <StatementSection title="Assets" rows={sheet.assets} total={sheet.assetsTotalUgx} />
            <div>
              <StatementSection title="Liabilities" rows={sheet.liabilities} total={sheet.liabilitiesTotalUgx} />
              <div className="border-t border-slate-100 dark:border-border"><StatementSection title="Equity" rows={sheet.equity} total={sheet.equityTotalUgx} /></div>
            </div>
          </div>
          <div className="flex items-center justify-between border-t-2 border-slate-200 px-4 py-4 dark:border-border sm:px-5">
            <span className="text-sm font-bold text-slate-900 dark:text-foreground">Assets = Liabilities + Equity</span>
            <span className="tabular text-sm font-bold text-slate-700 dark:text-muted-foreground">{ugx(sheet.assetsTotalUgx)} = {ugx(sheet.liabilitiesTotalUgx + sheet.equityTotalUgx)}</span>
          </div>
        </SectionCard>
      )}
    </>
  );
}
