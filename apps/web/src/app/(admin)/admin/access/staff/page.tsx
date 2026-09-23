import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { STAFF_ROLE_KEYS } from "@campushomes/shared";

import { Freshness, PageHeader, SectionCard } from "@/components/admin/admin-ui";
import { buttonVariants } from "@/components/ui/button";
import { apiServer } from "@/lib/server-api";
import { InviteStaffForm } from "../../invite-staff-form";
import { UsersManager, type UserRow } from "../../users/users-manager";
import { StaffInvitations } from "./staff-invitations";

export const metadata: Metadata = { title: "Staff Accounts" };

const STAFF_KEYS = new Set<string>(STAFF_ROLE_KEYS);

export default async function StaffAccountsPage() {
  const [data, invitations, roleData, propertyData, access] = await Promise.all([
    apiServer<{ rows: UserRow[]; asOf: string }>("/admin/users"),
    apiServer<Parameters<typeof StaffInvitations>[0]["rows"]>("/admin/staff/invitations"),
    apiServer<{ roles: { key: string; name: string; description: string }[]; permissions: { key: string; description: string; requiresStepUp: boolean }[] }>("/admin/roles"),
    apiServer<{ rows: { id: string; name: string; catchment: string }[] }>("/admin/properties"),
    apiServer<{ permissions: string[] }>("/admin/access/me"),
  ]);
  // Every account now carries a role assignment (students/landlords get an
  // 'own' one), so "has assignments" let landlords into this list. Staff =
  // holds a staff role.
  const rows = (data?.rows ?? []).filter((row) =>
    (row.assignments ?? []).some((a) => STAFF_KEYS.has(a.roleKey ?? a.key ?? "")),
  );
  return <><PageHeader eyebrow="Access control" title="Staff accounts" description="Invite internal users and review every active fine-grained role assignment and scope." actions={<><Link href="/admin/users" className={buttonVariants({ variant: "secondary" })}><KeyRound aria-hidden />All users</Link><InviteStaffForm /></>} />
    <SectionCard title={`${rows.length} staff accounts`} description="Edit details, change access, or remove a staff member. One account holds one staff role."><UsersManager staffOnly rows={rows} roles={roleData?.roles ?? []} permissions={roleData?.permissions ?? []} properties={propertyData?.rows ?? []} canMutate={access?.permissions.includes("users.update") ?? false} /></SectionCard>
    <div className="mt-5"><SectionCard title="Invitation lifecycle" description="Invitations expire 24 hours after sending. Pending ones can be edited, resent or cancelled; cancelled or expired ones can be deleted."><StaffInvitations rows={invitations ?? []} /></SectionCard></div>
    {data && <div className="mt-3"><Freshness asOf={data.asOf} /></div>}</>;
}
