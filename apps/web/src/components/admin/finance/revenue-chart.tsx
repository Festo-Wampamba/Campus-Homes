"use client";

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type RevenuePoint = { period: string; holdFeeRevenueUgx: number; refundsUgx: number; netRevenueUgx: number };

function ugx(value: number) {
  return new Intl.NumberFormat("en-UG", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function TooltipContent({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-border dark:bg-card">
      <p className="mb-1 font-bold text-slate-900 dark:text-foreground">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-1.5 text-slate-600 dark:text-muted-foreground">
          <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.name}: <span className="font-semibold text-slate-900 dark:text-foreground">{ugx(entry.value)} UGX</span>
        </p>
      ))}
    </div>
  );
}

// Fixed brand order — the same teal-600/coral-500 pair used everywhere else
// in the admin console (VerifiedBadge, the platform-growth bar chart), never
// cycled or reassigned by filter state.
export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  if (!data.length) return <p className="px-5 py-12 text-center text-sm text-slate-500 dark:text-muted-foreground">No revenue activity in this range yet.</p>;
  return (
    <div className="h-72 w-full p-4 sm:p-5">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100 dark:stroke-border" vertical={false} />
          <XAxis dataKey="period" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ className: "stroke-slate-200 dark:stroke-border" }} />
          <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={ugx} width={44} />
          <Tooltip content={<TooltipContent />} />
          <Legend
            wrapperStyle={{ fontSize: 11, fontWeight: 600 }}
            formatter={(value) => <span className="text-slate-600 dark:text-muted-foreground">{value}</span>}
          />
          <Area type="monotone" dataKey="holdFeeRevenueUgx" name="Hold fee revenue" stroke="var(--color-teal-600)" fill="var(--color-teal-600)" fillOpacity={0.15} strokeWidth={2} />
          <Area type="monotone" dataKey="refundsUgx" name="Refunds" stroke="var(--color-coral-500)" fill="var(--color-coral-500)" fillOpacity={0.15} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
