import { ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The one element allowed to use solid teal fill (DESIGN.md). It marks a
 * listing that passed the 6-component physical inspection — nothing else may
 * imitate this treatment, or the badge stops meaning anything.
 */
function VerifiedBadge({
  className,
  size = "default",
}: {
  className?: string;
  size?: "default" | "sm";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-primary font-semibold text-primary-foreground",
        size === "default" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs",
        className,
      )}
    >
      <ShieldCheck aria-hidden className={size === "default" ? "size-4" : "size-3.5"} />
      Verified
    </span>
  );
}

export { VerifiedBadge };
