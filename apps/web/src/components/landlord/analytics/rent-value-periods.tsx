"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatUgx } from "@/lib/format";
import { rentValueForPeriod } from "@/lib/landlord-analytics";
import { cn } from "@/lib/utils";
import type { RentValuePoint } from "./rent-value-chart";

const PERIODS = [
  { months: 1, button: "Monthly", label: "this month" },
  { months: 3, button: "Quarterly", label: "last 3 months" },
  { months: 6, button: "6 months", label: "last 6 months" },
  { months: 12, button: "12 months", label: "last 12 months" },
] as const;

/** Rent value over a period the landlord picks, from the same monthly
 * buckets as the "Rent value by month" chart. */
export function RentValuePeriods({ points }: { points: RentValuePoint[] }) {
  const [months, setMonths] = useState<number>(12);
  const period = PERIODS.find((candidate) => candidate.months === months) ?? PERIODS[3];

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-coral-500/10 text-coral-600 dark:bg-coral-500/15 dark:text-coral-500">
            <Wallet aria-hidden className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">Rent value, {period.label}</p>
            <p className="tabular text-2xl font-bold leading-tight text-foreground">
              {formatUgx(rentValueForPeriod(points, period.months))}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Collected by you directly. Not a CampusHomes payment</p>
          </div>
        </div>
        <div role="group" aria-label="Rent value period" className="flex flex-wrap gap-1.5">
          {PERIODS.map((candidate) => (
            <button
              key={candidate.months}
              type="button"
              aria-pressed={candidate.months === months}
              onClick={() => setMonths(candidate.months)}
              className={cn(
                "h-9 rounded-md border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                candidate.months === months
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted",
              )}
            >
              {candidate.button}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
