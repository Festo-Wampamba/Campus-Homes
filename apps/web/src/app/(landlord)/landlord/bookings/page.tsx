import type { Metadata } from "next";
import { CalendarCheck, DoorOpen, Inbox } from "lucide-react";

import { getLandlordReservations } from "@/lib/landlord";
import { bookingStage } from "@/lib/booking-stage";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/landlord/analytics/stat-card";
import { LandlordReservationsList } from "./landlord-reservations-list";
import { roomsByBedId } from "./room-lookup";

export const metadata: Metadata = { title: "Bookings" };

export default async function LandlordBookingsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [{ status = "all" }, all, rooms] = await Promise.all([searchParams, getLandlordReservations(), roomsByBedId()]);
  const bookings = all.filter((r) => bookingStage(r.status) === "booking");
  const awaitingMoveIn = bookings.filter((r) => r.status === "booked").length;
  const movedIn = bookings.filter((r) => r.status === "occupied").length;

  return (
    <>
      <h1 className="text-2xl">Bookings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Rooms you have confirmed for a student, and students who have moved in. Holds that aren&apos;t confirmed yet are under Reservations.
      </p>

      {bookings.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Inbox}
            title="No bookings yet"
            body="When you confirm a student's reservation, it becomes a booking and appears here."
          />
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="All bookings" value={String(bookings.length)} icon={Inbox} tone="teal" href="/landlord/bookings" />
            <StatCard label="Awaiting move-in" value={String(awaitingMoveIn)} icon={CalendarCheck} tone="coral" href="/landlord/bookings?status=booked" />
            <StatCard label="Moved in" value={String(movedIn)} icon={DoorOpen} tone="teal" href="/landlord/bookings?status=occupied" />
          </div>
          <LandlordReservationsList key={status} stage="booking" initialFilter={status} reservations={bookings} roomsByBedId={rooms} />
        </>
      )}
    </>
  );
}
