import type { PaymentReceipt } from "@campushomes/shared";

import { PAYMENT_METHOD_LABEL } from "@/components/landlord/confirm-booking-dialog";
import { formatUgx } from "@/lib/format";

/** Recorded booking fees and deposits; the same receipt both parties were emailed. */
export function ReceiptsTable({ receipts, showStudent }: { receipts: PaymentReceipt[]; showStudent: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground">
          <tr>
            <th className="px-3 py-2.5">Receipt</th>
            <th className="px-3 py-2.5">Date</th>
            {showStudent && <th className="px-3 py-2.5">Student</th>}
            <th className="px-3 py-2.5">Hostel / room</th>
            <th className="px-3 py-2.5">Paid with</th>
            <th className="px-3 py-2.5 text-right">Booking fee</th>
            <th className="px-3 py-2.5 text-right">Deposit</th>
            <th className="px-3 py-2.5 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {receipts.map((receipt) => (
            <tr key={receipt.id}>
              <td className="px-3 py-2.5 font-mono text-xs">{receipt.receiptNumber}</td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {new Date(receipt.recordedAt).toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" })}
              </td>
              {showStudent && <td className="px-3 py-2.5">{receipt.studentName ?? "Student"}</td>}
              <td className="px-3 py-2.5">{receipt.propertyName} · {receipt.roomLabel}</td>
              <td className="px-3 py-2.5">{receipt.paymentMethod ? PAYMENT_METHOD_LABEL[receipt.paymentMethod] ?? receipt.paymentMethod : "Not recorded"}</td>
              <td className="tabular px-3 py-2.5 text-right">{formatUgx(receipt.bookingFeeUgx)}</td>
              <td className="tabular px-3 py-2.5 text-right">{formatUgx(receipt.depositUgx)}</td>
              <td className="tabular px-3 py-2.5 text-right font-semibold">{formatUgx(receipt.totalUgx)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
