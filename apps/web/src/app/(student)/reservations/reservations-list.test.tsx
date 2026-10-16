import { renderToStaticMarkup } from "react-dom/server";
import type { StudentReservationView } from "@campushomes/shared";

import { ReservationsList, sortLiveFirst } from "./reservations-list";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

function reservation(id: string, status: StudentReservationView["status"]): StudentReservationView {
  return {
    id,
    studentId: "00000000-0000-4000-8000-000000000001",
    bedId: "00000000-0000-4000-8000-000000000002",
    listingVersionId: "00000000-0000-4000-8000-000000000003",
    status,
    reservedAt: "2026-10-14T11:30:00.000Z",
    reservedExpiresAt: status === "reserved" ? "2026-10-15T11:30:00.000Z" : null,
    bookedAt: null,
    bookingFeeCollectedUgx: null,
    depositCollectedUgx: null,
    paymentMethod: null,
    listingId: "00000000-0000-4000-8000-000000000004",
    propertyName: `Hostel ${id.slice(0, 4)}`,
    propertyStreetAddress: "Kikoni",
    bedLabel: "Bed 1",
    roomCategory: "double",
    roomCapacity: 2,
    rentPerTermUgx: 800_000,
    depositUgx: null,
  };
}

const CANCELLED_NEWER = reservation("aaaa0000-0000-4000-8000-000000000000", "cancelled");
const RESERVED_OLDER = reservation("bbbb0000-0000-4000-8000-000000000000", "reserved");

describe("sortLiveFirst", () => {
  it("puts live reservations before past ones", () => {
    expect(sortLiveFirst([CANCELLED_NEWER, RESERVED_OLDER]).map((r) => r.status)).toEqual(["reserved", "cancelled"]);
  });
});

describe("ReservationsList", () => {
  it("marks the reservation the student just made", () => {
    const html = renderToStaticMarkup(
      <ReservationsList reservations={[RESERVED_OLDER]} highlightId={RESERVED_OLDER.id} />,
    );

    expect(html).toContain("Just reserved");
  });

  it("shows when the hold ends", () => {
    const html = renderToStaticMarkup(<ReservationsList reservations={[RESERVED_OLDER]} />);

    expect(html).toContain("Held for you until Thu 15 Oct, 2:30 pm");
  });

  it("shows a short reference for support", () => {
    const html = renderToStaticMarkup(<ReservationsList reservations={[RESERVED_OLDER]} />);

    expect(html).toContain("Ref BBBB0000");
  });

  it("offers Request booking on a room on hold", () => {
    const html = renderToStaticMarkup(<ReservationsList reservations={[RESERVED_OLDER]} />);
    expect(html).toContain("Request booking");
  });

  it("shows the booking request once sent", () => {
    const html = renderToStaticMarkup(
      <ReservationsList reservations={[{ ...RESERVED_OLDER, bookingRequestedAt: "2026-10-15T08:00:00.000Z" }]} />,
    );
    expect(html).toContain("Booking requested");
  });

  it("opens the booking tracker for the reservation linked from the dashboard", () => {
    const html = renderToStaticMarkup(
      <ReservationsList reservations={[RESERVED_OLDER]} trackId={RESERVED_OLDER.id} />,
    );
    expect(html).toContain('aria-label="Booking progress"');
  });

  it("keeps the booking tracker closed until asked", () => {
    const html = renderToStaticMarkup(<ReservationsList reservations={[RESERVED_OLDER]} />);
    expect(html).not.toContain('aria-label="Booking progress"');
  });
});
