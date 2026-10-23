import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A small, consistently labelled icon fact used by public listing cards and
 * their detail surfaces. The text remains the accessible source of truth;
 * the icon is supporting decoration and is hidden from assistive technology.
 */
export function FeatureIcon({
  icon: Icon,
  label,
  className,
  iconClassName,
}: {
  icon: LucideIcon;
  label: string;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2 text-sm text-muted-foreground", className)}>
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
        <Icon aria-hidden className={cn("size-4", iconClassName)} />
      </span>
      <span className="min-w-0">{label}</span>
    </span>
  );
}
