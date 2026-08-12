"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type RentValuePoint = { month: string; rentValueUgx: number };

function ugx(value: number) {
  return new Intl.NumberFormat("en-UG", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function TooltipContent({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-bold text-foreground">{label}</p>
      <p className="flex items-center gap-1.5 text-muted-foreground">
        <span aria-hidden className="size-2 rounded-full bg-coral-500" />
        UGX <span className="font-semibold text-foreground">{ugx(payload[0].value)}</span>
      </p>
    </div>
  );
}

// Listed rent value from confirmed move-ins, by month — money collected
// directly between landlord and tenant, never through CampusHomes (see
// lib/landlord-analytics.ts rentValueTrend for why this isn't "payments").
export function RentValueChart({ data }: { data: RentValuePoint[] }) {
  if (data.every((d) => d.rentValueUgx === 0)) {
    return (
      <p className="px-5 py-14 text-center text-sm text-muted-foreground">
        Fills in once bookings on your units are confirmed move-ins.
      </p>
    );
  }
  return (
    <div className="h-64 w-full p-4 sm:p-5">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={{ className: "stroke-border" }}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={ugx}
            width={40}
          />
          <Tooltip content={<TooltipContent />} />
          <Line
            type="monotone"
            dataKey="rentValueUgx"
            name="Rent value"
            stroke="var(--color-coral-500)"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
