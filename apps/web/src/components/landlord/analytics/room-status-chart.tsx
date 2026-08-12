"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export type RoomStatusSlice = { name: string; value: number; color: string };

function TooltipContent({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-bold text-foreground">
        {name}: <span className="font-semibold">{value}</span>
      </p>
    </div>
  );
}

// Donut of every room across every property, bucketed by its live
// reservation status (null → "Available") — a real snapshot, not a sampled
// or estimated split.
export function RoomStatusChart({ data }: { data: RoomStatusSlice[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    return (
      <p className="px-5 py-14 text-center text-sm text-muted-foreground">
        Add rooms to your properties to see this breakdown.
      </p>
    );
  }
  return (
    <div className="relative h-64 w-full p-4 sm:p-5">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="85%"
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((slice) => (
              <Cell key={slice.name} fill={slice.color} />
            ))}
          </Pie>
          <Tooltip content={<TooltipContent />} />
          <Legend
            layout="vertical"
            verticalAlign="middle"
            align="right"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, fontWeight: 600 }}
            formatter={(value) => <span className="text-muted-foreground">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute top-1/2 left-[42%] -translate-x-1/2 -translate-y-1/2 text-center">
        <p className="tabular text-xl font-bold text-foreground">{total}</p>
        <p className="text-[10px] text-muted-foreground">rooms</p>
      </div>
    </div>
  );
}
