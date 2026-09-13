import type { Metadata } from "next";
import type { PendingLandlordAccount } from "@campushomes/shared";

import { apiServer } from "@/lib/server-api";
import { LandlordAccountsManager } from "@/components/landlords/landlord-accounts-manager";

export const metadata: Metadata = { title: "Landlord accounts" };

export default async function LandlordAccountsPage() {
  const [accounts, approvedAccounts] = await Promise.all([
    apiServer<PendingLandlordAccount[]>("/admin/landlord-accounts"),
    apiServer<PendingLandlordAccount[]>("/admin/landlord-accounts/approved"),
  ]);

  return (
    <>
      <h1 className="text-2xl">Landlord accounts</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Review submitted landlord applications before granting dashboard access.
      </p>
      <LandlordAccountsManager initialAccounts={accounts ?? []} initialApprovedAccounts={approvedAccounts ?? []} />
    </>
  );
}
