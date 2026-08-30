import type { Metadata } from "next";
import { Activity, Building2, CalendarCheck2, CircleDollarSign, Clock3, RefreshCcw, Users } from "lucide-react";
import Link from "next/link";

import { Freshness, PageHeader, SectionCard, StatCard, StatusBadge } from "@/components/admin/admin-ui";
import { GrowthChart } from "@/components/admin/growth-chart";
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

function ugx(value: number) {
  return new Intl.NumberFormat("en-UG", { notation: "compact", maximumFractionDigits: 1 }).format(value) + " UGX";
}

export default async function AdminOverviewPage() {
  const data = await apiServer<Overview>("/admin/overview");
  if (!data) return <><PageHeader eyebrow="Command centre" title="Overview unavailable" description="The admin API could not be reached or this account does not hold analytics.read." /><div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Start the API and database, then refresh this page. No placeholder metrics are shown.</div></>;
  const s = data.summary;
  const queueTotal = s.pendingKyc + s.pendingVisits + s.pendingRefunds + s.failedNotifications;
  const reservationTotal = Math.max(1, data.reservationStatus.reduce((sum, row) => sum + row.count, 0));

  return <>
    <PageHeader eyebrow="Command centre" title="Good day, Festo" description="A live view of CampusHomes growth, trust operations, reservations, and platform health." actions={<Link href="/admin/audit-log" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-border dark:bg-card dark:text-foreground"><RefreshCcw aria-hidden className="size-4" />Review activity</Link>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Total users" value={s.totalUsers.toLocaleString()} detail={`${s.activeUsers.toLocaleString()} active accounts`} trend={change(s.newUsers30d, s.priorUsers30d)} icon={Users} tone="teal" />
      <StatCard label="Properties" value={s.properties.toLocaleString()} detail={`${s.verifiedListings.toLocaleString()} verified listings`} icon={Building2} tone="blue" />
      <StatCard label="Reservations" value={s.reservations.toLocaleString()} detail={`${s.reservations30d.toLocaleString()} in the last 30 days`} trend={change(s.reservations30d, s.priorReservations30d)} icon={CalendarCheck2} tone="violet" />
      <StatCard label="Verified revenue" value={ugx(s.revenueUgx)} detail={`${ugx(s.revenue30dUgx)} in the last 30 days`} trend={change(s.revenue30dUgx, s.priorRevenue30dUgx)} icon={CircleDollarSign} tone="amber" />
    </div>

    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.75fr)]">
      <SectionCard title="Platform growth" description="New user and reservation records by month"><GrowthChart rows={data.growth} /></SectionCard>
      <SectionCard title="Action queue" description={`${queueTotal} items currently need attention`}>
        <div className="divide-y divide-slate-100 dark:divide-border">
          {[
            ["Landlord identity review", s.pendingKyc, "/admin/verifications"],
            ["Properties waiting verification", s.pendingVisits, "/admin/verifications"],
            ["Pending refunds", s.pendingRefunds, "/admin/payments"],
            ["Failed notifications", s.failedNotifications, "/admin/audit-log"],
          ].map(([label, count, href]) => <Link key={String(label)} href={String(href)} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-muted/40"><span className="grid size-8 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground"><Clock3 aria-hidden className="size-4" /></span><span className="text-sm font-semibold text-slate-700 dark:text-foreground">{label}</span><span className="tabular ml-auto text-sm font-bold text-slate-950 dark:text-foreground">{Number(count).toLocaleString()}</span></Link>)}
        </div>
      </SectionCard>
    </div>

    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
      <SectionCard title="Recent audited activity" description="Latest immutable platform actions" action={<Link href="/admin/audit-log" className="text-xs font-bold text-teal-700 hover:underline">View all</Link>}>
        <div className="divide-y divide-slate-100 dark:divide-border">{data.recentActivity.length ? data.recentActivity.map((row) => <div key={row.id} className="flex items-start gap-3 px-5 py-3.5"><span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-100"><Activity aria-hidden className="size-4" /></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800 dark:text-foreground">{row.action.replaceAll("_", " ")}</p><p className="mt-0.5 text-xs text-slate-500 dark:text-muted-foreground">{row.actorName} · {row.targetType} {row.targetId.slice(0, 8)}</p></div><time className="ml-auto shrink-0 text-[10px] text-slate-400">{new Date(row.ts).toLocaleString()}</time></div>) : <p className="px-5 py-12 text-center text-sm text-slate-500">No audited actions yet.</p>}</div>
      </SectionCard>
      <SectionCard title="Reservation status" description="Current lifecycle distribution">
        <div className="space-y-4 p-5">{data.reservationStatus.length ? data.reservationStatus.map((row) => <div key={row.status}><div className="mb-1.5 flex items-center justify-between gap-3"><StatusBadge value={row.status} /><span className="tabular text-xs font-bold text-slate-700 dark:text-foreground">{row.count}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-muted"><div className="h-full rounded-full bg-teal-600" style={{ width: `${row.count / reservationTotal * 100}%` }} /></div></div>) : <p className="py-8 text-center text-sm text-slate-500">No reservations yet.</p>}</div>
      </SectionCard>
    </div>
    <div className="mt-4"><Freshness asOf={data.meta.asOf} source={data.meta.source} /></div>
  </>;
}
