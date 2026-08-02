import type { Metadata } from "next";
import type { LedgerAccount } from "@campushomes/shared";

import { PageHeader, SectionCard } from "@/components/admin/admin-ui";
import { FinanceTabs } from "@/components/admin/finance/finance-tabs";
import { apiServer } from "@/lib/server-api";
import { AccountsManager } from "./accounts-manager";

export const metadata: Metadata = { title: "Chart of Accounts" };

export default async function FinanceAccountsPage() {
  const [accounts, access] = await Promise.all([
    apiServer<LedgerAccount[]>("/admin/finance/accounts"),
    apiServer<{ permissions: string[] }>("/admin/access/me"),
  ]);
  const canManage = (access?.permissions ?? []).includes("finance.manage");

  return (
    <>
      <PageHeader eyebrow="Finance" title="Chart of accounts" description="The accounts hold-fee revenue and refunds post to automatically, plus anything recorded by hand." />
      <FinanceTabs />
      <SectionCard
        title="Accounts"
        description={canManage ? "Add sub-accounts and record manual journal entries." : "Read-only — you don't hold finance.manage."}
      >
        <AccountsManager accounts={accounts ?? []} canManage={canManage} />
      </SectionCard>
    </>
  );
}
