import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

const TONES = {
  teal: "bg-teal-50 text-teal-700 dark:bg-teal-100",
  coral: "bg-coral-500/10 text-coral-600 dark:bg-coral-500/15 dark:text-coral-500",
  neutral: "bg-muted text-muted-foreground",
} as const;

/**
 * Landlord-portal stat card: icon tile on the left, label above a big tabular
 * number, and an optional one-line detail underneath (a real count breakdown,
 * never a fabricated trend; this portal has no historical baseline to diff
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
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", TONES[tone])}>
            <Icon aria-hidden className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-muted-foreground">{label}</p>
            <p className="tabular text-2xl font-bold leading-tight text-foreground">{value}</p>
          </div>
        </div>
        {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
      </CardContent>
    </Card>
  );
}
