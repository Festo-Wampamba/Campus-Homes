import type { Metadata } from "next";

import { AdminTable } from "@/components/admin/admin-table";
import { Freshness, PageHeader, SectionCard } from "@/components/admin/admin-ui";
import { apiServer } from "@/lib/server-api";

export const metadata: Metadata = { title: "Audit Log" };

export default async function AuditLogPage() {
  const data = await apiServer<{ rows: Record<string, unknown>[]; total: number; asOf: string; limit: number }>("/admin/audit");
  return <><PageHeader eyebrow="Access control" title="Audit log" description="Immutable, append-only history for operational and administrative mutations." />
    <SectionCard title={`${data?.total.toLocaleString() ?? 0} audited actions`} description={`Newest first · latest ${data?.limit ?? 250}`}><AdminTable rows={data?.rows ?? []} filename="campushomes-audit-log.csv" searchPlaceholder="Search actor, action, role, target…" columns={[
      { key: "ts", label: "Time", format: "date" }, { key: "actorName", label: "Actor" }, { key: "actorRole", label: "Actor role" }, { key: "action", label: "Action" }, { key: "targetType", label: "Target type" }, { key: "targetId", label: "Target", format: "id" }, { key: "ipAddress", label: "IP address" },
    ]} /></SectionCard>{data && <div className="mt-3"><Freshness asOf={data.asOf} /></div>}</>;
}
