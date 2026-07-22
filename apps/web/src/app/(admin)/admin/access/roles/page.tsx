import type { Metadata } from "next";

import { Freshness, PageHeader } from "@/components/admin/admin-ui";
import { apiServer } from "@/lib/server-api";
import { RolesManager } from "./roles-manager";

export const metadata: Metadata = { title: "Roles & Permissions" };

interface RolesPayload {
  roles: { id: string; key: string; name: string; description: string; isSystem: boolean; permissionCount: number; userCount: number }[];
  permissions: { id: string; key: string; description: string; requiresStepUp: boolean }[];
  grants: { roleKey: string; permissionKey: string }[];
  asOf: string;
}

export default async function RolesPage() {
  const [data, access] = await Promise.all([
    apiServer<RolesPayload>("/admin/roles"),
    apiServer<{ permissions: string[] }>("/admin/access/me"),
  ]);
  const firstKey = data?.roles[0]?.key;
  const detail = firstKey ? await apiServer<(RolesPayload["roles"][number] & { permissionKeys: string[]; assignedUsers: { assignmentId: string; id: string; name: string; email: string | null; status: string; scopeType: string; scopeId: string | null; validUntil: string | null }[] })>(`/admin/roles/${firstKey}`) : null;
  return <><PageHeader eyebrow="Access control" title="Roles & permissions" description="Fine-grained capability grants and scoped access for administrators, operations, landlords, custodians, property workers, and students." />
    {data && detail ? <RolesManager roles={data.roles} permissions={data.permissions} initialDetail={detail} canEdit={access?.permissions.includes("settings.manage") ?? false} /> : <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Role configuration is unavailable. Confirm the RBAC migration and your roles.read assignment.</div>}
    {data && <div className="mt-3"><Freshness asOf={data.asOf} /></div>}</>;
}
