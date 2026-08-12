"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type PropertyOccupancyRow = {
  name: string;
  occupancyRate: number; // 0-100
  occupied: number;
  total: number;
};

function TooltipContent({ active, payload }: { active?: boolean; payload?: { payload: PropertyOccupancyRow }[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-bold text-foreground">{row.name}</p>
      <p className="text-muted-foreground">
        <span className="font-semibold text-foreground">{row.occupancyRate}%</span> occupied ·{" "}
        {row.occupied}/{row.total} rooms
      </p>
    </div>
  );
}

// One bar per property — occupancy % (fulfilled rooms / total rooms), teal
// scaling to coral as occupancy climbs so a fully-booked property visually
// stands out from a mostly-empty one.
export function PropertyOccupancyChart({ data }: { data: PropertyOccupancyRow[] }) {
  if (data.length === 0) {
    return (
      <p className="px-5 py-14 text-center text-sm text-muted-foreground">
        Occupancy per property shows up here once you have verified listings.
      </p>
    );
  }
  return (
    <div className="h-64 w-full p-4 sm:p-5">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={{ className: "stroke-border" }}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={110}
          />
          <Tooltip content={<TooltipContent />} cursor={{ fill: "var(--color-muted)" }} />
          <Bar dataKey="occupancyRate" radius={[0, 4, 4, 0]} maxBarSize={18}>
            {data.map((row) => (
              <Cell
                key={row.name}
                fill={row.occupancyRate >= 70 ? "var(--color-coral-500)" : "var(--color-teal-600)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
