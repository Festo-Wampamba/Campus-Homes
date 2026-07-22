import type { Metadata } from "next";

import { Freshness, PageHeader, SectionCard } from "@/components/admin/admin-ui";
import { apiServer } from "@/lib/server-api";
import { UsersManager } from "./users-manager";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const [data, roleData, propertyData, access] = await Promise.all([
    apiServer<{ rows: (Record<string, unknown> & { id: string; name: string; role: string; status: string })[]; asOf: string; limit: number }>("/admin/users"),
    apiServer<{ roles: { key: string; name: string; description: string }[]; permissions: { key: string; description: string; requiresStepUp: boolean }[] }>("/admin/roles"),
    apiServer<{ rows: { id: string; name: string; catchment: string }[] }>("/admin/properties"),
    apiServer<{ permissions: string[] }>("/admin/access/me"),
  ]);
  const rows = data?.rows ?? [];
  return <><PageHeader eyebrow="User management" title="All users" description="Search students, landlords, operations staff, and administrators from one source-backed directory." />
    <SectionCard title={`${rows.length.toLocaleString()} user records`} description={`Newest first · bounded to ${data?.limit ?? 250} records`}><UsersManager rows={rows} roles={roleData?.roles ?? []} permissions={roleData?.permissions ?? []} properties={propertyData?.rows ?? []} canMutate={access?.permissions.includes("users.update") ?? false} /></SectionCard>{data && <div className="mt-3"><Freshness asOf={data.asOf} /></div>}</>;
}
