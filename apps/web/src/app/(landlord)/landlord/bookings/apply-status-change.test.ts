import type { LandlordReservationView } from "@campushomes/shared";

import { applyStatusChange } from "./landlord-reservations-list";

const row = (id: string, status: LandlordReservationView["status"]) => ({ id, status }) as LandlordReservationView;

describe("applyStatusChange", () => {
  it("drops a released booking from the Bookings list", () => {
    expect(applyStatusChange([row("a", "booked")], "a", "released", "booking")).toEqual([]);
  });

  it("keeps a booking that moves in on the Bookings list", () => {
    expect(applyStatusChange([row("a", "booked")], "a", "occupied", "booking")[0]?.status).toBe("occupied");
  });

  it("keeps a released hold on the Reservations list", () => {
    expect(applyStatusChange([row("a", "reserved")], "a", "released", "reservation")).toHaveLength(1);
  });
});
