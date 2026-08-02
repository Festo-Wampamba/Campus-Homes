import type { Metadata } from "next";
import type { ProfitLossReport, RevenueSeriesPoint } from "@campushomes/shared";
import { CircleDollarSign, ReceiptText, TrendingDown, Wallet } from "lucide-react";

import { PageHeader, SectionCard, StatCard } from "@/components/admin/admin-ui";
import { FinanceTabs } from "@/components/admin/finance/finance-tabs";
import { RevenueChart } from "@/components/admin/finance/revenue-chart";
import { apiServer } from "@/lib/server-api";

export const metadata: Metadata = { title: "Finance" };

function ugx(value: number) {
  return new Intl.NumberFormat("en-UG", { notation: "compact", maximumFractionDigits: 1 }).format(value) + " UGX";
}

function sixMonthWindow() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

export default async function FinanceOverviewPage() {
  const { from, to } = sixMonthWindow();
  const [series, pl] = await Promise.all([
    apiServer<RevenueSeriesPoint[]>(`/admin/finance/reports/revenue-series?from=${from}&to=${to}`),
    apiServer<ProfitLossReport>(`/admin/finance/reports/profit-loss?from=${from}&to=${to}`),
  ]);

  if (!series || !pl) {
    return (
      <>
        <PageHeader eyebrow="Finance" title="Finance" description="Revenue, refunds, and the general ledger." />
        <FinanceTabs />
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Could not load finance data. Start the API and database, then refresh this page.
        </div>
      </>
    );
  }

  const refundsLine = pl.revenue.find((r) => r.accountCode === "4900");
  const refundsUgx = Math.abs(refundsLine?.amountUgx ?? 0);

  return (
    <>
      <PageHeader eyebrow="Finance" title="Finance" description="Revenue, refunds, and the general ledger, updated live from the reservation hold-fee flow." />
      <FinanceTabs />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Net income" value={ugx(pl.netIncomeUgx)} detail={`${from} → ${to}`} icon={Wallet} tone="teal" />
        <StatCard label="Hold fee revenue" value={ugx(pl.totalRevenueUgx + refundsUgx)} detail="Gross, before refunds" icon={CircleDollarSign} tone="blue" />
        <StatCard label="Refunds" value={ugx(refundsUgx)} detail="Cancellations and expired holds" icon={TrendingDown} tone="amber" />
        <StatCard label="Operating expenses" value={ugx(pl.totalExpensesUgx)} detail="Manually recorded" icon={ReceiptText} tone="violet" />
      </div>

      <div className="mt-5">
        <SectionCard title="Revenue over time" description="Hold fees collected vs. refunds, by month">
          <RevenueChart data={series} />
        </SectionCard>
      </div>
    </>
  );
}
