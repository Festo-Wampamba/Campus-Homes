import type { Metadata } from "next";
import { Wallet } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ReceiptsTable } from "@/components/payments/receipts-table";
import { Card, CardContent } from "@/components/ui/card";
import { formatUgx, kampalaMonth } from "@/lib/format";
import { getMyReceipts } from "@/lib/receipts";

export const metadata: Metadata = { title: "Payments & Earnings" };

export default async function LandlordPaymentsPage() {
  const receipts = await getMyReceipts("landlord");
  const currentMonth = kampalaMonth(new Date());
  const thisMonth = receipts?.filter((r) => kampalaMonth(new Date(r.recordedAt)) === currentMonth) ?? [];
  const sum = (list: { totalUgx: number }[]) => list.reduce((total, r) => total + r.totalUgx, 0);

  return (
    <>
      <h1 className="text-2xl">Payments & Earnings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Booking fees and deposits you recorded when confirming a booking or adding a walk-in student, cash or mobile money.
        You and the student each get an emailed receipt.
      </p>

      {receipts === null ? (
        <p role="alert" className="mt-6 text-sm text-destructive">Couldn&apos;t load your payments. Refresh the page to try again.</p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card><CardContent className="p-4"><p className="tabular text-2xl font-bold">{formatUgx(sum(receipts))}</p><p className="text-xs text-muted-foreground">Total recorded</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="tabular text-2xl font-bold">{formatUgx(sum(thisMonth))}</p><p className="text-xs text-muted-foreground">This month</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="tabular text-2xl font-bold">{receipts.length}</p><p className="text-xs text-muted-foreground">Receipts</p></CardContent></Card>
          </div>
          <div className="mt-6">
            {receipts.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="No payments recorded yet"
                body="When you confirm a booking or add a walk-in student, enter the booking fee or deposit you received. It shows here with its receipt."
              />
            ) : (
              <ReceiptsTable receipts={receipts} showStudent />
            )}
          </div>
        </>
      )}
    </>
  );
}
