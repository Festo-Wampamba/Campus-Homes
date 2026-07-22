import type { Metadata } from "next";

import { AdminTable } from "@/components/admin/admin-table";
import { Freshness, PageHeader, SectionCard } from "@/components/admin/admin-ui";
import { apiServer } from "@/lib/server-api";

export const metadata: Metadata = { title: "Disputes & Trust" };

export default async function CasesPage() {
  const data = await apiServer<{ rows: Record<string, unknown>[]; asOf: string; modelNote: string }>("/admin/cases");
  return <><PageHeader eyebrow="Resolution centre" title="Disputes & trust" description="A unified MVP view of dispute refunds, landlord strikes, and student flags without manufacturing a separate case record." />
    <SectionCard title={`${data?.rows.length ?? 0} trust records`} description={data?.modelNote ?? "Refund, strike, and flag records"}><AdminTable rows={data?.rows ?? []} filename="campushomes-trust-cases.csv" searchPlaceholder="Search subject, reason, description, status…" columns={[
      { key: "id", label: "Record", format: "id" }, { key: "type", label: "Type" }, { key: "subject", label: "Subject" }, { key: "reason", label: "Reason" }, { key: "description", label: "Description" }, { key: "status", label: "Status", format: "status" }, { key: "amountUgx", label: "Amount", format: "money" }, { key: "reservationId", label: "Reservation", format: "id" }, { key: "createdAt", label: "Created", format: "date" },
    ]} /></SectionCard>{data && <div className="mt-3"><Freshness asOf={data.asOf} /></div>}</>;
}
