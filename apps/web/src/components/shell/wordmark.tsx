import Image from "next/image";

import { cn } from "@/lib/utils";

function RoofMark({ className }: { className?: string }) {
  return (
    <Image
      src="/images/branding/campushomes-mark.png"
      alt=""
      aria-hidden
      width={512}
      height={509}
      className={cn("h-[1.4em] w-auto", className)}
      priority
    />
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
            "font-brand text-xl tracking-tight",
            onDark ? "text-white" : "text-teal-700",
          )}
        >
          CampusHomes
        </span>
        <span
          className={cn(
            "font-brand-script text-lg",
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
        "inline-flex items-center gap-1.5 font-brand text-lg",
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
