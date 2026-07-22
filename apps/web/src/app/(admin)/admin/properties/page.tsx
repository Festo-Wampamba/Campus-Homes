import type { Metadata } from "next";

import { Freshness, PageHeader, SectionCard } from "@/components/admin/admin-ui";
import { apiServer } from "@/lib/server-api";
import { PropertiesManager } from "./properties-manager";

export const metadata: Metadata = { title: "Properties" };

export default async function PropertiesPage() {
  const [data, users, settings, access] = await Promise.all([
    apiServer<{ rows: (Record<string, unknown> & { id: string; name: string; landlordName: string; catchment: string; type: string; status: string; operationalStatus: string; unitCount: number; availableUnits: number; imageCount: number })[]; asOf: string; limit: number }>("/admin/properties"),
    apiServer<{ rows: { id: string; name: string; email?: string | null; role: string }[] }>("/admin/users"),
    apiServer<{ semesters: { id: string; name: string; university?: string | null; semesterType?: string | null; academicYear?: string | null; startsOn: string; endsOn: string }[] }>("/admin/settings"),
    apiServer<{ permissions: string[] }>("/admin/access/me"),
  ]);
  const rows = data?.rows ?? [];
  return <><PageHeader eyebrow="Inventory & trust" title="Properties" description="Landlord submissions, listing state, unit inventory, and the latest physical verification signal." />
    <SectionCard title={`${rows.length.toLocaleString()} properties`} description="Operational inventory, scoped teams, media, utilities, and verification state"><PropertiesManager rows={rows} landlords={(users?.rows ?? []).filter((user) => user.role === "landlord")} semesters={settings?.semesters ?? []} permissions={access?.permissions ?? []} /></SectionCard>{data && <div className="mt-3"><Freshness asOf={data.asOf} /></div>}</>;
}
