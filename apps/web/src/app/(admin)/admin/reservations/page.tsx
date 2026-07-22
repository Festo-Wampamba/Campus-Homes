import type { Metadata } from "next";

import { AdminTable } from "@/components/admin/admin-table";
import { Freshness, PageHeader, SectionCard } from "@/components/admin/admin-ui";
import { apiServer } from "@/lib/server-api";

export const metadata: Metadata = { title: "Reservations" };

export default async function ReservationsPage() {
  const data = await apiServer<{ rows: Record<string, unknown>[]; asOf: string; limit: number }>("/admin/reservations");
  return <><PageHeader eyebrow="Reservation operations" title="Reservations" description="Track the 72-hour hold, payment, cooling-off, fulfilment, cancellation, and refund lifecycle." />
    <SectionCard title={`${data?.rows.length ?? 0} reservations`} description="Newest first"><AdminTable rows={data?.rows ?? []} filename="campushomes-reservations.csv" searchPlaceholder="Search student, property, unit, status…" columns={[
      { key: "id", label: "Reference", format: "id" }, { key: "student", label: "Student" }, { key: "property", label: "Property" }, { key: "unit", label: "Unit" }, { key: "status", label: "Reservation", format: "status" }, { key: "paymentStatus", label: "Payment", format: "status" }, { key: "feeAmountUgx", label: "Fee", format: "money" }, { key: "holdExpiresAt", label: "Hold expiry", format: "date" }, { key: "createdAt", label: "Created", format: "date" },
    ]} /></SectionCard>{data && <div className="mt-3"><Freshness asOf={data.asOf} /></div>}</>;
}
