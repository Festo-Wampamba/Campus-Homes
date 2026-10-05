import { cn } from "@/lib/utils";
import type { ApprovalStatus } from "./approval-status";

// Decorative: the heading next to it carries the meaning. Motion only runs
// under motion-safe, so reduced-motion users see a still stamp.
export function ReviewStamp({ status }: { status: ApprovalStatus }) {
  const pressing = status === "pending";
  const approved = status === "verified";
  return (
    <svg viewBox="0 0 160 170" aria-hidden className="h-40 w-40">
      <ellipse cx="80" cy="150" rx="58" ry="10" className="fill-teal-900/10" />
      <rect x="28" y="122" width="104" height="30" rx="6" className={approved ? "fill-coral-500/15" : "fill-muted"} />
      <text
        x="80"
        y="143"
        textAnchor="middle"
        className={cn(
          "font-display text-[15px] font-bold tracking-[0.2em]",
          approved ? "fill-coral-600" : "fill-muted-foreground/40",
        )}
      >
        APPROVED
      </text>
      <ellipse
        cx="80"
        cy="122"
        rx="44"
        ry="7"
        className={cn(
          "fill-none stroke-coral-500 stroke-2 opacity-0 [transform-box:fill-box] origin-center",
          pressing && "motion-safe:animate-ink-ring",
        )}
      />
      <g className={cn("[transform-box:fill-box] origin-bottom", pressing && "motion-safe:animate-stamp-press")}>
        <circle cx="80" cy="30" r="18" className="fill-teal-600" />
        <rect x="72" y="44" width="16" height="40" rx="4" className="fill-teal-700" />
        <rect x="40" y="84" width="80" height="16" rx="4" className="fill-teal-800" />
        <rect x="44" y="100" width="72" height="18" rx="3" className="fill-coral-500" />
      </g>
    </svg>
  );
}
