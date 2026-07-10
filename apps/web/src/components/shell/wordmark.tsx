import { cn } from "@/lib/utils";

function RoofMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 42 15"
      className={cn("h-[0.4em] w-auto text-coral-500", className)}
    >
      <polyline
        points="3,13 21,3 39,13"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Wordmark({
  className,
  onDark = false,
  stacked = false,
}: {
  className?: string;
  onDark?: boolean;
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <span className={cn("inline-flex flex-col items-center gap-1.5", className)}>
        <RoofMark className="h-3" />
        <span
          className={cn(
            "font-display text-xl font-bold tracking-tight",
            onDark ? "text-white" : "text-teal-700",
          )}
        >
          CampusHomes
        </span>
        <span
          className={cn(
            "font-display text-[11px] font-semibold uppercase tracking-wide",
            // coral-500 is ~2.5:1 on white — too light for 11px text (WCAG AA
            // needs 4.5:1); darkened here only, coral-500 stays for onDark.
            onDark ? "text-coral-500" : "text-[oklch(0.57_0.13_22)]",
          )}
        >
          Live, Learn, Succeed
        </span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-display text-lg font-bold",
        onDark ? "text-white" : "text-teal-700",
        className,
      )}
    >
      <RoofMark />
      CampusHomes
    </span>
  );
}

export { Wordmark };
