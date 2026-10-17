/** Landlords see two separate lists (decided 2026-10-17) so a hold is never
 * mistaken for a confirmed booking:
 * - reservation: a student is holding a bed (reserved), or the hold ended
 *   without a booking (released, expired, cancelled, refunded);
 * - booking: the landlord confirmed it (booked), or the student moved in. */
export type BookingStage = "reservation" | "booking";

export function bookingStage(status: string): BookingStage {
  return status === "booked" || status === "occupied" ? "booking" : "reservation";
}
