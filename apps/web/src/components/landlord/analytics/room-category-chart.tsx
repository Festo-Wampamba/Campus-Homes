"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type RoomCategoryRow = { category: string; count: number; avgPriceUgx: number };

function ugx(value: number) {
  return new Intl.NumberFormat("en-UG", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function TooltipContent({ active, payload }: { active?: boolean; payload?: { payload: RoomCategoryRow }[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-bold text-foreground">{row.category}</p>
      <p className="text-muted-foreground">
        <span className="font-semibold text-foreground">{row.count}</span> {row.count === 1 ? "room" : "rooms"}
      </p>
      <p className="text-muted-foreground">
        Avg <span className="font-semibold text-foreground">UGX {ugx(row.avgPriceUgx)}</span> / semester
      </p>
    </div>
  );
}

// Portfolio composition — how the landlord's rooms split across category
// types, each bar labelled with its average listed semester price.
export function RoomCategoryChart({ data }: { data: RoomCategoryRow[] }) {
  if (data.length === 0) {
    return (
      <p className="px-5 py-14 text-center text-sm text-muted-foreground">
        Room categories show up here once units are added to a property.
      </p>
    );
  }
  return (
    <div className="h-64 w-full p-4 sm:p-5">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis
            dataKey="category"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={{ className: "stroke-border" }}
          />
          <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
          <Tooltip content={<TooltipContent />} cursor={{ fill: "var(--color-muted)" }} />
          <Bar dataKey="count" name="Rooms" fill="var(--color-teal-600)" radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
