import { ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The one element allowed to use solid teal fill (DESIGN.md). It marks a
 * listing that passed the 6-component physical inspection — nothing else may
 * imitate this treatment, or the badge stops meaning anything.
 */
const VERIFIED_BADGE_EXPLAINER =
  "Verified: a CampusHomes inspector physically visited this property and confirmed its location, rooms, amenities, photos, landlord identity and safety before it was listed.";

function VerifiedBadge({
  className,
  size = "default",
}: {
  className?: string;
  size?: "default" | "sm";
}) {
  return (
    <span
      role="img"
      aria-label={VERIFIED_BADGE_EXPLAINER}
      title={VERIFIED_BADGE_EXPLAINER}
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
