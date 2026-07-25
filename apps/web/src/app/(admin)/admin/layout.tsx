import { redirect } from "next/navigation";

import { AdminShell, type AdminNavItem } from "@/components/admin/admin-shell";
import { apiServer } from "@/lib/server-api";
import { requireRole } from "@/lib/session";

interface Access {
  permissions: string[];
  assignments: { roleKey: string; roleName: string }[];
}

const NAV: (AdminNavItem & { any: string[] })[] = [
  { label: "Overview", href: "/admin", icon: "overview", group: "Operations", any: ["analytics.read"] },
  { label: "Users", href: "/admin/users", icon: "users", group: "Operations", any: ["students.read", "landlords.read", "staff.read"] },
  { label: "Properties", href: "/admin/properties", icon: "properties", group: "Operations", any: ["properties.read"] },
  { label: "Verifications", href: "/admin/verifications", icon: "verifications", group: "Operations", any: ["visits.read", "landlords.read"] },
  { label: "Reservations", href: "/admin/reservations", icon: "reservations", group: "Operations", any: ["reservations.read"] },
  { label: "Activities", href: "/admin/activities", icon: "activities", group: "Operations", any: ["activities.manage", "activities.read"] },
  { label: "Payments", href: "/admin/payments", icon: "payments", group: "Operations", any: ["payments.read"] },
  { label: "Disputes & trust", href: "/admin/cases", icon: "cases", group: "Operations", any: ["disputes.read", "refunds.read", "strikes.read"] },
  { label: "Reports", href: "/admin/reports", icon: "reports", group: "Operations", any: ["analytics.read"] },
  { label: "Roles & permissions", href: "/admin/access/roles", icon: "roles", group: "Access control", any: ["roles.read"] },
  { label: "Staff accounts", href: "/admin/access/staff", icon: "staff", group: "Access control", any: ["staff.read"] },
  { label: "Audit log", href: "/admin/audit-log", icon: "audit", group: "Access control", any: ["audit.read"] },
  { label: "Platform settings", href: "/admin/settings", icon: "settings", group: "Configuration", any: ["semesters.manage", "universities.manage", "settings.manage"] },
  { label: "Integrations", href: "/admin/integrations", icon: "integrations", group: "Configuration", any: ["integrations.read"] },
];

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireRole(["admin"]);
  const access = await apiServer<Access>("/admin/access/me");
  if (!access?.assignments.length) redirect("/sign-in");
  const granted = new Set(access.permissions);
  const nav = NAV.filter((item) => item.any.some((permission) => granted.has(permission))).map((item) => ({
    label: item.label,
    href: item.href,
    icon: item.icon,
    group: item.group,
  }));
  const roleLabel = [...new Set(access.assignments.map((assignment) => assignment.roleName))].join(" · ");
  return <AdminShell nav={nav} user={session.user} roleLabel={roleLabel}>{children}</AdminShell>;
}
