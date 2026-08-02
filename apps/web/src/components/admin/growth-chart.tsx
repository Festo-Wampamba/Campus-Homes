"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type GrowthRow = { month: string; users: number; reservations: number };

function TooltipContent({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-border dark:bg-card">
      <p className="mb-1 font-bold text-slate-900 dark:text-foreground">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-1.5 text-slate-600 dark:text-muted-foreground">
          <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.name}: <span className="font-semibold text-slate-900 dark:text-foreground">{entry.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

// Same fixed teal-600/coral-500 brand pair as everywhere else in the admin
// console (StatCard tones, VerifiedBadge, the finance revenue chart) —
// rendering swapped from hand-rolled CSS bars to recharts, same visual
// language and series order.
export function GrowthChart({ rows }: { rows: GrowthRow[] }) {
  return (
    <div className="h-64 w-full p-4 sm:p-5">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100 dark:stroke-border" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ className: "stroke-slate-200 dark:stroke-border" }} />
          <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
          <Tooltip content={<TooltipContent />} />
          <Legend
            wrapperStyle={{ fontSize: 11, fontWeight: 600 }}
            formatter={(value) => <span className="text-slate-600 dark:text-muted-foreground">{value}</span>}
          />
          <Line type="monotone" dataKey="users" name="Users" stroke="var(--color-teal-600)" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="reservations" name="Reservations" stroke="var(--color-coral-500)" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
