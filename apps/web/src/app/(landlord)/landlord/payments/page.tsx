import type { Metadata } from "next";
import { Wallet } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Payments & Earnings" };

export default function LandlordPaymentsPage() {
  return (
    <>
      <h1 className="text-2xl">Payments & Earnings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Track your rental income and payment history.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-muted-foreground">—</p>
            <p className="text-xs text-muted-foreground">Total earnings</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-muted-foreground">—</p>
            <p className="text-xs text-muted-foreground">Pending payouts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-muted-foreground">—</p>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <EmptyState
          icon={Wallet}
          title="Payments launch in a later phase"
          body="CampusHomes verifies listings, bookings, and messaging first. Real-money payouts to landlords go live in Phase 2 — this page will fill in once that's active."
        />
      </div>
    </>
  );
}
