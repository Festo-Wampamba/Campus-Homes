import {
  BarChart3,
  Building2,
  CalendarClock,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  FileClock,
  Gauge,
  KeyRound,
  Landmark,
  Link2,
  Settings,
  Tickets,
  UserCog,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";

import { AppShell, type AppNavItem } from "@/components/shell/app-shell";
import { apiServer } from "@/lib/server-api";
import { requireRole } from "@/lib/session";

interface Access {
  permissions: string[];
  assignments: { roleKey: string; roleName: string }[];
}

const ICON_SIZE = "size-4 shrink-0";

const NAV: (AppNavItem & { any: string[] })[] = [
  { label: "Overview", href: "/admin", icon: <Gauge aria-hidden className={ICON_SIZE} />, group: "Operations", any: ["analytics.read"] },
  { label: "Users", href: "/admin/users", icon: <Users aria-hidden className={ICON_SIZE} />, group: "Operations", any: ["students.read", "landlords.read", "staff.read"] },
  { label: "Properties", href: "/admin/properties", icon: <Building2 aria-hidden className={ICON_SIZE} />, group: "Operations", any: ["properties.read"] },
  { label: "Verifications", href: "/admin/verifications", icon: <ClipboardCheck aria-hidden className={ICON_SIZE} />, group: "Operations", any: ["visits.read", "landlords.read"] },
  { label: "Reservations", href: "/admin/reservations", icon: <CalendarDays aria-hidden className={ICON_SIZE} />, group: "Operations", any: ["reservations.read"] },
  { label: "Activities", href: "/admin/activities", icon: <CalendarClock aria-hidden className={ICON_SIZE} />, group: "Operations", any: ["activities.manage", "activities.read"] },
  { label: "Payments", href: "/admin/payments", icon: <CircleDollarSign aria-hidden className={ICON_SIZE} />, group: "Operations", any: ["payments.read"] },
  { label: "Finance", href: "/admin/finance", icon: <Landmark aria-hidden className={ICON_SIZE} />, group: "Operations", any: ["finance.read", "finance.manage"] },
  { label: "Disputes & trust", href: "/admin/cases", icon: <Tickets aria-hidden className={ICON_SIZE} />, group: "Operations", any: ["disputes.read", "refunds.read", "strikes.read"] },
  { label: "Reports", href: "/admin/reports", icon: <BarChart3 aria-hidden className={ICON_SIZE} />, group: "Operations", any: ["analytics.read"] },
  { label: "Roles & permissions", href: "/admin/access/roles", icon: <KeyRound aria-hidden className={ICON_SIZE} />, group: "Access control", any: ["roles.read"] },
  { label: "Staff accounts", href: "/admin/access/staff", icon: <UserCog aria-hidden className={ICON_SIZE} />, group: "Access control", any: ["staff.read"] },
  { label: "Audit log", href: "/admin/audit-log", icon: <FileClock aria-hidden className={ICON_SIZE} />, group: "Access control", any: ["audit.read"] },
  { label: "Platform settings", href: "/admin/settings", icon: <Settings aria-hidden className={ICON_SIZE} />, group: "Configuration", any: ["semesters.manage", "universities.manage", "settings.manage"] },
  { label: "Integrations", href: "/admin/integrations", icon: <Link2 aria-hidden className={ICON_SIZE} />, group: "Configuration", any: ["integrations.read"] },
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
  const canViewAudit = nav.some((item) => item.href === "/admin/audit-log");
  const canViewSettings = nav.some((item) => item.href === "/admin/settings");
  return (
    <AppShell
      nav={nav}
      user={session.user}
      portalLabel={roleLabel}
      homeHref="/admin"
      profileHref="/admin/profile"
      settingsHref={canViewSettings ? "/admin/settings" : undefined}
      auditLogHref={canViewAudit ? "/admin/audit-log" : undefined}
      notificationsEndpoint="/admin/audit"
    >
      {children}
    </AppShell>
  );
}
