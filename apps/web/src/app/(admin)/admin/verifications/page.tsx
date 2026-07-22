import type { Metadata } from "next";

import { AdminTable } from "@/components/admin/admin-table";
import { AdminExportPanel } from "@/components/admin/admin-export-panel";
import { Freshness, PageHeader, SectionCard } from "@/components/admin/admin-ui";
import { apiServer } from "@/lib/server-api";

export const metadata: Metadata = { title: "Verifications" };

export default async function VerificationsPage() {
  const data = await apiServer<{ visits: Record<string, unknown>[]; landlordKyc: Record<string, unknown>[]; asOf: string }>("/admin/verifications");
  return <><PageHeader eyebrow="Trust operations" title="Verification centre" description="Monitor landlord KYC and the six-part property inspection workflow from submission through approval." />
    <div className="space-y-5"><AdminExportPanel endpoint="/admin/verifications/export" fixedReportType="verifications" /><SectionCard title="Property visits" description="Physical verification assignments and evidence completion"><AdminTable rows={data?.visits ?? []} filename="campushomes-verification-visits.csv" searchPlaceholder="Search property, inspector, catchment…" columns={[
      { key: "propertyName", label: "Property" }, { key: "catchment", label: "Catchment" }, { key: "inspectorName", label: "Inspector" }, { key: "result", label: "Result", format: "status" }, { key: "checklistItems", label: "Checks" }, { key: "scheduledAt", label: "Scheduled", format: "date" }, { key: "completedAt", label: "Completed", format: "date" }, { key: "failureReason", label: "Finding" },
    ]} /></SectionCard><SectionCard title="Landlord KYC" description="Identity review queue and completed decisions"><AdminTable rows={data?.landlordKyc ?? []} filename="campushomes-landlord-kyc.csv" searchPlaceholder="Search landlord, email, phone, status…" columns={[
      { key: "name", label: "Landlord" }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" }, { key: "status", label: "KYC status", format: "status" }, { key: "submittedAt", label: "Submitted", format: "date" }, { key: "reviewedAt", label: "Reviewed", format: "date" },
    ]} /></SectionCard></div>{data && <div className="mt-3"><Freshness asOf={data.asOf} /></div>}</>;
}
