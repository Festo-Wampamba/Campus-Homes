import type { Metadata } from "next";
import type { PendingLandlordAccount } from "@campushomes/shared";

import { apiServer } from "@/lib/server-api";
import { LandlordAccountsManager } from "@/components/landlords/landlord-accounts-manager";

export const metadata: Metadata = { title: "Landlord accounts" };

export default async function AdminLandlordAccountsPage() {
  const accounts = (await apiServer<PendingLandlordAccount[]>("/admin/landlord-accounts")) ?? [];

  return (
    <>
      <h1 className="text-2xl">Landlord accounts</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Self-registered landlord accounts awaiting approval before they can sign in.
      </p>
      <LandlordAccountsManager initialAccounts={accounts} />
    </>
  );
}
