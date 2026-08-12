"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export type CampusSlice = { name: string; value: number; color: string };

function TooltipContent({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-bold text-foreground">
        {name}: <span className="font-semibold">{value}</span> {value === 1 ? "property" : "properties"}
      </p>
    </div>
  );
}

// How the landlord's own portfolio splits across the 4 launch catchments.
export function CampusChart({ data }: { data: CampusSlice[] }) {
  if (data.length === 0) {
    return (
      <p className="px-5 py-14 text-center text-sm text-muted-foreground">
        Add a property to see your reach across campuses.
      </p>
    );
  }
  return (
    <div className="h-64 w-full p-4 sm:p-5">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" outerRadius="80%" paddingAngle={2} strokeWidth={0}>
            {data.map((slice) => (
              <Cell key={slice.name} fill={slice.color} />
            ))}
          </Pie>
          <Tooltip content={<TooltipContent />} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, fontWeight: 600 }}
            formatter={(value) => <span className="text-muted-foreground">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
