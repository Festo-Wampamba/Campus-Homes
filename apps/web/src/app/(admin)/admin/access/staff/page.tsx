import type { Metadata } from "next";

import { AdminTable } from "@/components/admin/admin-table";
import { Freshness, PageHeader, SectionCard } from "@/components/admin/admin-ui";
import { apiServer } from "@/lib/server-api";
import { InviteStaffForm } from "../../invite-staff-form";

export const metadata: Metadata = { title: "Staff Accounts" };

export default async function StaffAccountsPage() {
  const data = await apiServer<{ rows: Record<string, unknown>[]; asOf: string }>("/admin/users");
  const rows = (data?.rows ?? []).filter((row) => Array.isArray(row.assignments) && row.assignments.length > 0);
  return <><PageHeader eyebrow="Access control" title="Staff accounts" description="Invite internal users and review every active fine-grained role assignment and scope." actions={<InviteStaffForm />} />
    <SectionCard title={`${rows.length} staff accounts`} description="Active assignments determine access; the coarse account type is only an RLS backstop"><AdminTable rows={rows} filename="campushomes-staff.csv" searchPlaceholder="Search staff, role, scope, status…" columns={[
      { key: "name", label: "Staff member" }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" }, { key: "assignments", label: "Role & scope", format: "roles" }, { key: "status", label: "Account", format: "status" }, { key: "createdAt", label: "Added", format: "date" },
    ]} /></SectionCard>{data && <div className="mt-3"><Freshness asOf={data.asOf} /></div>}</>;
}
