import { Check, X } from "lucide-react";

import type { StudentReservationView } from "@campushomes/shared";

import { bookingSteps, type StepState } from "@/lib/booking-progress";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATE_TEXT: Record<StepState, string> = {
  done: "Done",
  current: "Next step",
  upcoming: "Not yet",
  ended: "Ended",
};

export function BookingTracker({ reservation, id }: { reservation: StudentReservationView; id: string }) {
  const steps = bookingSteps(reservation);

  return (
    <ol id={id} aria-label="Booking progress" className="space-y-0">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        return (
          <li key={step.key} className="relative flex gap-3 pb-4 last:pb-0">
            {!isLast && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[11px] top-6 h-[calc(100%-1.25rem)] w-0.5",
                  step.state === "done" ? "bg-teal-600" : "bg-border",
                )}
              />
            )}
            <span
              aria-hidden
              className={cn(
                "relative z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2",
                step.state === "done" && "border-teal-600 bg-teal-600 text-white",
                step.state === "current" && "border-teal-600 bg-background",
                step.state === "upcoming" && "border-border bg-background",
                step.state === "ended" && "border-destructive bg-destructive text-white",
              )}
            >
              {step.state === "done" && <Check className="size-3.5" strokeWidth={3} />}
              {step.state === "current" && <span className="size-2 rounded-full bg-teal-600" />}
              {step.state === "ended" && <X className="size-3.5" strokeWidth={3} />}
            </span>
            <div className="min-w-0">
              <p
                className={cn(
                  "text-sm font-semibold",
                  step.state === "upcoming" ? "text-muted-foreground" : "text-foreground",
                  step.state === "ended" && "text-destructive",
                )}
              >
                {step.label}
                <span className="sr-only"> ({STATE_TEXT[step.state]})</span>
                {step.at && step.state !== "upcoming" && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{formatDateTime(step.at)}</span>
                )}
              </p>
              {step.state !== "upcoming" && <p className="text-sm text-muted-foreground">{step.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
