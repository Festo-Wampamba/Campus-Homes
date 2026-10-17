import { bookingStage } from "./booking-stage";

describe("bookingStage", () => {
  it("treats a held bed as a reservation", () => {
    expect(bookingStage("reserved")).toBe("reservation");
  });

  it("treats a landlord-confirmed bed as a booking", () => {
    expect(bookingStage("booked")).toBe("booking");
  });

  it("treats a moved-in student as a booking", () => {
    expect(bookingStage("occupied")).toBe("booking");
  });

  it("keeps a reservation that fell through on the reservations side", () => {
    expect(bookingStage("expired")).toBe("reservation");
  });
});
