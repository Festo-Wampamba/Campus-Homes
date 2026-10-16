import type { StudentReservationView } from "@campushomes/shared";

import { bookingStage, bookingSteps, isBooking } from "./booking-progress";

const base = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "reserved",
  reservedAt: "2026-10-16T09:09:00.000Z",
  reservedExpiresAt: "2026-10-17T09:09:00.000Z",
  bookingRequestedAt: null,
  bookedAt: null,
  moveInConfirmedAt: null,
  updatedAt: "2026-10-16T09:09:00.000Z",
} as unknown as StudentReservationView;

function at(overrides: Partial<StudentReservationView>): StudentReservationView {
  return { ...base, ...overrides };
}

function states(r: StudentReservationView) {
  return bookingSteps(r).map((step) => `${step.key}:${step.state}`);
}

it("asks for a booking request first after reserving", () => {
  expect(states(base)).toEqual(["reserved:done", "requested:current", "confirmed:upcoming", "moved-in:upcoming"]);
});

it("waits on the landlord once booking is requested", () => {
  expect(states(at({ bookingRequestedAt: "2026-10-16T09:20:00.000Z" }))).toEqual([
    "reserved:done",
    "requested:done",
    "confirmed:current",
    "moved-in:upcoming",
  ]);
});

it("moves on to move-in once the landlord confirms", () => {
  expect(states(at({ status: "booked", bookedAt: "2026-10-16T10:00:00.000Z" }))).toEqual([
    "reserved:done",
    "requested:done",
    "confirmed:done",
    "moved-in:current",
  ]);
});

it("is complete after move-in", () => {
  expect(states(at({ status: "occupied", bookedAt: "2026-10-16T10:00:00.000Z" })).at(-1)).toBe("moved-in:done");
});

it("ends the journey where an expired hold stopped", () => {
  expect(states(at({ status: "expired", bookingRequestedAt: "2026-10-16T09:20:00.000Z" }))).toEqual([
    "reserved:done",
    "requested:done",
    "ended:ended",
  ]);
});

it("does not count a plain hold as a booking", () => {
  expect(isBooking(base)).toBe(false);
});

it("shows a requested booking as waiting for the landlord", () => {
  expect(bookingStage(at({ bookingRequestedAt: "2026-10-16T09:20:00.000Z" })).label).toBe("Waiting for landlord");
});
