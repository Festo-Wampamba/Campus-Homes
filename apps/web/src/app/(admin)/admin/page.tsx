import type { Metadata } from "next";
import { BedDouble, BellOff, Building2, CalendarCheck2, CircleDollarSign, ClipboardCheck, IdCard, ReceiptText, RefreshCcw, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/session";
import { workspaceHome } from "@/lib/auth-routing";

import { Freshness, PageHeader, SectionCard, StatCard, StatusBadge } from "@/components/admin/admin-ui";
import { auditIcon, auditTone, describeAuditAction } from "@/components/admin/audit-action";
import { GrowthChart } from "@/components/admin/growth-chart";
import { timeOfDayGreeting } from "@/lib/greeting";
import { cn } from "@/lib/utils";
import { apiServer } from "@/lib/server-api";

export const metadata: Metadata = { title: "Super Admin Overview" };

interface Overview {
  summary: Record<string, number>;
  growth: { month: string; users: number; reservations: number }[];
  reservationStatus: { status: string; count: number }[];
  recentActivity: { id: string; actorName: string; action: string; targetType: string; targetId: string; ts: string }[];
  meta: { asOf: string; source: string; grain: string };
}

function change(current: number, previous: number) {
  if (previous === 0) return current > 0 ? null : 0;
  return ((current - previous) / previous) * 100;
}

const TONE_TILE = {
  positive: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950",
  negative: "bg-red-50 text-red-700 dark:bg-red-950",
  neutral: "bg-teal-50 text-teal-700 dark:bg-teal-100",
} as const;

function ugx(value: number) {
  return new Intl.NumberFormat("en-UG", { notation: "compact", maximumFractionDigits: 1 }).format(value) + " UGX";
}

export default async function AdminOverviewPage() {
  const session = await requireWorkspace("admin");
  const home = workspaceHome(session.access, "admin");
  if (home !== "/admin") redirect(home);
  const data = await apiServer<Overview>("/admin/overview");
  if (!data) return <><PageHeader eyebrow="Command centre" title="Overview unavailable" description="The admin API could not be reached or this account does not hold analytics.read." /><div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Start the API and database, then refresh this page. No placeholder metrics are shown.</div></>;
  const s = data.summary;
  const queueTotal = s.pendingKyc + s.pendingVisits + s.pendingRoomChanges + s.pendingRefunds + s.failedNotifications;
  const reservationTotal = Math.max(1, data.reservationStatus.reduce((sum, row) => sum + row.count, 0));

  return <>
    <PageHeader eyebrow="Command centre" title={`${timeOfDayGreeting()}, ${session.user.name?.split(" ")[0] || "there"}`} description="A live view of CampusHomes growth, trust operations, reservations, and platform health." actions={<Link href="/admin/audit-log" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-border dark:bg-card dark:text-foreground"><RefreshCcw aria-hidden className="size-4" />Review activity</Link>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Total users" value={s.totalUsers.toLocaleString()} detail={`${s.activeUsers.toLocaleString()} active accounts`} trend={change(s.newUsers30d, s.priorUsers30d)} icon={Users} tone="teal" />
      <StatCard label="Properties" value={s.properties.toLocaleString()} detail={`${s.verifiedListings.toLocaleString()} verified listings`} icon={Building2} tone="blue" />
      <StatCard label="Reservations" value={s.reservations.toLocaleString()} detail={`${s.reservations30d.toLocaleString()} in the last 30 days`} trend={change(s.reservations30d, s.priorReservations30d)} icon={CalendarCheck2} tone="slate" />
      <StatCard label="Verified revenue" value={ugx(s.revenueUgx)} detail={`${ugx(s.revenue30dUgx)} in the last 30 days`} trend={change(s.revenue30dUgx, s.priorRevenue30dUgx)} icon={CircleDollarSign} tone="amber" />
    </div>

    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.75fr)]">
      <SectionCard title="Platform growth" description="New user and reservation records by month"><GrowthChart rows={data.growth} /></SectionCard>
      <SectionCard title="Action queue" description={`${queueTotal} items currently need attention`}>
        <div className="divide-y divide-slate-100 dark:divide-border">
          {([
            ["Landlord identity review", s.pendingKyc, "/admin/verifications", IdCard],
            ["Properties waiting verification", s.pendingVisits, "/admin/verifications", ClipboardCheck],
            ["Room changes awaiting review", s.pendingRoomChanges, "/admin/room-changes", BedDouble],
            ["Pending refunds", s.pendingRefunds, "/admin/payments", ReceiptText],
            ["Failed notifications", s.failedNotifications, "/admin/audit-log", BellOff],
          ] as [string, number, string, LucideIcon][]).map(([label, count, href, Icon]) => <Link key={label} href={href} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-muted/40"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground"><Icon aria-hidden className="size-4.5" /></span><span className="min-w-0 text-sm font-semibold text-slate-700 dark:text-foreground">{label}</span><span className={cn("tabular ml-auto rounded-full px-2 py-0.5 text-xs font-bold", count > 0 ? "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "text-slate-500 dark:text-muted-foreground")}>{count.toLocaleString()}</span></Link>)}
        </div>
      </SectionCard>
    </div>

    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
      <SectionCard title="Recent audited activity" description="Latest immutable platform actions" action={<Link href="/admin/audit-log" className="text-xs font-bold text-teal-700 hover:underline">View all</Link>}>
        <div className="divide-y divide-slate-100 dark:divide-border">{data.recentActivity.length ? data.recentActivity.map((row) => { const Icon = auditIcon(row.action); return <div key={row.id} className="flex items-center gap-3 px-5 py-3.5"><span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", TONE_TILE[auditTone(row.action)])}><Icon aria-hidden className="size-4.5" /></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800 dark:text-foreground">{describeAuditAction(row.action).text}</p><p className="mt-0.5 truncate text-xs text-slate-500 dark:text-muted-foreground">{row.actorName} · {row.targetType.replaceAll("_", " ")} {row.targetId.slice(0, 8)}</p></div><time dateTime={row.ts} className="ml-auto shrink-0 text-xs text-slate-500 dark:text-muted-foreground">{new Date(row.ts).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time></div>; }) : <p className="px-5 py-12 text-center text-sm text-slate-500">No audited actions yet.</p>}</div>
      </SectionCard>
      <SectionCard title="Reservation status" description="Current lifecycle distribution">
        <div className="space-y-4 p-5">{data.reservationStatus.length ? data.reservationStatus.map((row) => <div key={row.status}><div className="mb-1.5 flex items-center justify-between gap-3"><StatusBadge value={row.status} /><span className="tabular text-xs font-bold text-slate-700 dark:text-foreground">{row.count}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-muted"><div className="h-full rounded-full bg-teal-600" style={{ width: `${row.count / reservationTotal * 100}%` }} /></div></div>) : <p className="py-8 text-center text-sm text-slate-500">No reservations yet.</p>}</div>
      </SectionCard>
    </div>
    <div className="mt-4"><Freshness asOf={data.meta.asOf} source={data.meta.source} /></div>
  </>;
}
