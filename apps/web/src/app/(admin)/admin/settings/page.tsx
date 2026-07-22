import type { Metadata } from "next";
import { Freshness, PageHeader } from "@/components/admin/admin-ui";
import { apiServer } from "@/lib/server-api";
import { SettingsManager } from "./settings-manager";

export const metadata: Metadata = { title: "Platform Settings" };

export default async function SettingsPage() {
  const [data, access] = await Promise.all([
    apiServer<{ semesters: { id: string; name: string; university?: string | null; semesterType?: string | null; academicYear?: string | null; customName?: string | null; startsOn: string; endsOn: string; reVerificationWindowStartsOn: string }[]; reservationPolicy: { holdHours: number; feeUgx: number }; settings: { verificationValidMonths: number; registrationsOpen: boolean; maintenanceMode: boolean; reportRetentionDays: number; supportContact: { email: string; phone: string } }; asOf: string }>("/admin/settings"),
    apiServer<{ permissions: string[] }>("/admin/access/me"),
  ]);
  return <><PageHeader eyebrow="Configuration" title="Platform settings" description="Operational policy and semester configuration currently enforced by CampusHomes services." />
    {data && <SettingsManager policy={data.reservationPolicy} settings={data.settings} semesters={data.semesters} canManage={access?.permissions.includes("settings.manage") ?? false} />}
    {data && <div className="mt-3"><Freshness asOf={data.asOf} /></div>}</>;
}
