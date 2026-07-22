import type { Metadata } from "next";

import { AdminTable } from "@/components/admin/admin-table";
import { Freshness, PageHeader, SectionCard } from "@/components/admin/admin-ui";
import { apiServer } from "@/lib/server-api";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage() {
  const data = await apiServer<{ payments: Record<string, unknown>[]; refunds: Record<string, unknown>[]; asOf: string }>("/admin/payments");
  return <><PageHeader eyebrow="Financial operations" title="Payments & refunds" description="Provider transactions, verified webhooks, reconciliation signals, and the refund queue. Secrets remain server-side." />
    <div className="space-y-5"><SectionCard title="Transactions" description="Latest reservation-fee payment attempts"><AdminTable rows={data?.payments ?? []} filename="campushomes-payments.csv" searchPlaceholder="Search customer, transaction, method, status…" columns={[
      { key: "id", label: "Payment", format: "id" }, { key: "customer", label: "Customer" }, { key: "amountUgx", label: "Amount", format: "money" }, { key: "paymentMethod", label: "Method" }, { key: "status", label: "Status", format: "status" }, { key: "webhookVerified", label: "Webhook", format: "boolean" }, { key: "providerTxnId", label: "Provider transaction" }, { key: "createdAt", label: "Created", format: "date" },
    ]} /></SectionCard><SectionCard title="Refunds" description="Cooling-off, landlord failure, disputes, and cancellations"><AdminTable rows={data?.refunds ?? []} filename="campushomes-refunds.csv" searchPlaceholder="Search reason, reservation, status…" columns={[
      { key: "id", label: "Refund", format: "id" }, { key: "reservationId", label: "Reservation", format: "id" }, { key: "reason", label: "Reason" }, { key: "amountUgx", label: "Amount", format: "money" }, { key: "status", label: "Status", format: "status" }, { key: "providerRefundId", label: "Provider refund" }, { key: "createdAt", label: "Requested", format: "date" }, { key: "processedAt", label: "Processed", format: "date" },
    ]} /></SectionCard></div>{data && <div className="mt-3"><Freshness asOf={data.asOf} /></div>}</>;
}
