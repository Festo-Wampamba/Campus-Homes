import type { StudentReservationView } from "@campushomes/shared";

import { formatDateTime } from "@/lib/format";

export type StepState = "done" | "current" | "upcoming" | "ended";
export type BookingStep = { key: string; label: string; detail: string; at: string | null; state: StepState };

const ENDED: Partial<Record<StudentReservationView["status"], { label: string; detail: string }>> = {
  cancelled: { label: "Reservation cancelled", detail: "This reservation was cancelled. Reserve again if a bed is free." },
  expired: { label: "Hold expired", detail: "The 24-hour hold ran out before the landlord confirmed. Reserve again if a bed is free." },
  released: { label: "Released by the landlord", detail: "The landlord released this bed. Contact support if you need help." },
  refunded: { label: "Refunded", detail: "This reservation was closed and refunded." },
};

/** The booking journey for one reservation: reserved → requested → confirmed → moved in. */
export function bookingSteps(r: StudentReservationView): BookingStep[] {
  const requested = Boolean(r.bookingRequestedAt) || r.status === "booked" || r.status === "occupied";
  const confirmed = r.status === "booked" || r.status === "occupied";
  const movedIn = r.status === "occupied";
  const holdEnds = r.status === "reserved" && r.reservedExpiresAt ? ` Your hold ends ${formatDateTime(r.reservedExpiresAt)}.` : "";

  const steps: BookingStep[] = [
    { key: "reserved", label: "Room reserved", detail: "A free hold on one bed while you view it and agree terms.", at: r.reservedAt ?? null, state: "done" },
    {
      key: "requested",
      label: "Booking requested",
      detail: requested
        ? "The landlord was told you want this room."
        : `View the room and agree the rent with the landlord, then tap Request booking.${holdEnds}`,
      at: r.bookingRequestedAt ?? null,
      state: requested ? "done" : "current",
    },
    {
      key: "confirmed",
      label: "Landlord confirmed",
      detail: confirmed
        ? "The bed is yours. Pay rent to the landlord as you agreed."
        : `Waiting for the landlord to confirm. Use Message to follow up.${holdEnds}`,
      at: r.bookedAt ?? null,
      state: confirmed ? "done" : requested ? "current" : "upcoming",
    },
    {
      key: "moved-in",
      label: "Moved in",
      detail: movedIn ? "Booking complete. Welcome home!" : "Tap Confirm move-in once you have moved in.",
      at: r.moveInConfirmedAt ?? null,
      state: movedIn ? "done" : confirmed ? "current" : "upcoming",
    },
  ];

  const ended = ENDED[r.status];
  if (!ended) return steps;
  // Keep what was completed, then close the journey where it stopped.
  return [
    ...steps.filter((step) => step.state === "done"),
    { key: "ended", label: ended.label, detail: ended.detail, at: r.updatedAt ?? null, state: "ended" },
  ];
}

/** Reservations that have entered booking: requested, confirmed or moved in. */
export function isBooking(r: StudentReservationView): boolean {
  return Boolean(r.bookingRequestedAt) || r.status === "booked" || r.status === "occupied";
}

export type BookingStage = { label: string; tone: "success" | "warning" | "neutral" | "destructive" };

/** One-line booking status for the dashboard. */
export function bookingStage(r: StudentReservationView): BookingStage {
  if (r.status === "occupied") return { label: "Moved in · complete", tone: "success" };
  if (r.status === "booked") return { label: "Confirmed · move in next", tone: "success" };
  if (r.status === "reserved") return { label: "Waiting for landlord", tone: "warning" };
  if (r.status === "released") return { label: "Released by landlord", tone: "destructive" };
  return { label: ENDED[r.status]?.label ?? "Ended", tone: "neutral" };
}
