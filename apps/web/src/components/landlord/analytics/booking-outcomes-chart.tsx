"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type BookingOutcomeRow = { outcome: string; count: number };

const GOOD = new Set(["Fulfilled"]);
const BAD = new Set(["Cancelled", "Expired", "Payment failed"]);

function TooltipContent({ active, payload }: { active?: boolean; payload?: { payload: BookingOutcomeRow }[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-bold text-foreground">
        {row.outcome}: <span className="font-semibold">{row.count}</span>
      </p>
    </div>
  );
}

// Every reservation ever placed on the landlord's units, by final outcome —
// the booking funnel (all time), distinct from the room-status donut which
// only shows the live snapshot right now.
export function BookingOutcomesChart({ data }: { data: BookingOutcomeRow[] }) {
  if (data.length === 0) {
    return (
      <p className="px-5 py-14 text-center text-sm text-muted-foreground">
        Shows up once students start booking your rooms.
      </p>
    );
  }
  return (
    <div className="h-64 w-full p-4 sm:p-5">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis
            dataKey="outcome"
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={{ className: "stroke-border" }}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={50}
          />
          <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
          <Tooltip content={<TooltipContent />} cursor={{ fill: "var(--color-muted)" }} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {data.map((row) => (
              <Cell
                key={row.outcome}
                fill={
                  GOOD.has(row.outcome)
                    ? "var(--color-teal-600)"
                    : BAD.has(row.outcome)
                      ? "var(--color-coral-500)"
                      : "var(--color-warning)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
