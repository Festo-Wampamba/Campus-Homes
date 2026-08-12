"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type BookingsTrendPoint = { week: string; bookings: number };

function TooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-bold text-foreground">{label}</p>
      <p className="flex items-center gap-1.5 text-muted-foreground">
        <span aria-hidden className="size-2 rounded-full bg-teal-600" />
        {payload[0].value} {payload[0].value === 1 ? "booking" : "bookings"}
      </p>
    </div>
  );
}

// Same teal-600 brand line used by the admin console's growth/revenue
// charts — real weeks from reservations.createdAt, never interpolated.
export function BookingsTrendChart({ data }: { data: BookingsTrendPoint[] }) {
  if (data.every((d) => d.bookings === 0)) {
    return (
      <p className="px-5 py-14 text-center text-sm text-muted-foreground">
        No bookings on your units yet — this fills in as students reserve.
      </p>
    );
  }
  return (
    <div className="h-64 w-full p-4 sm:p-5">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis
            dataKey="week"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={{ className: "stroke-border" }}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={28}
            allowDecimals={false}
          />
          <Tooltip content={<TooltipContent />} />
          <Area
            type="monotone"
            dataKey="bookings"
            name="Bookings"
            stroke="var(--color-teal-600)"
            fill="var(--color-teal-600)"
            fillOpacity={0.15}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
