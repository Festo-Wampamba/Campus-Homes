import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

const TONES = {
  teal: "bg-teal-50 text-teal-700 dark:bg-teal-100",
  coral: "bg-coral-500/10 text-coral-600 dark:bg-coral-500/15 dark:text-coral-500",
  neutral: "bg-muted text-muted-foreground",
} as const;

/**
 * Landlord-portal stat card — icon badge + big tabular number + label, with
 * an optional one-line detail underneath (e.g. a real count breakdown, never
 * a fabricated trend — this portal has no historical baseline to diff
 * against yet, unlike the admin console's StatCard).
 */
export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "teal",
}: {
  label: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  tone?: keyof typeof TONES;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">{label}</p>
          <p className="tabular mt-1.5 text-2xl font-bold text-foreground">{value}</p>
          {detail && <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>}
        </div>
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", TONES[tone])}>
          <Icon aria-hidden className="size-4.5" />
        </span>
      </CardContent>
    </Card>
  );
}
