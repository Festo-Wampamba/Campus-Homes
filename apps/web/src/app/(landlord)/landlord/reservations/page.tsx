import type { Metadata } from "next";
import { BellRing, CalendarClock, Clock, Inbox, XCircle } from "lucide-react";

import { getLandlordReservations } from "@/lib/landlord";
import { bookingStage } from "@/lib/booking-stage";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/landlord/analytics/stat-card";
import { LandlordReservationsList } from "../bookings/landlord-reservations-list";
import { roomsByBedId } from "../bookings/room-lookup";

export const metadata: Metadata = { title: "Reservations" };

export default async function LandlordReservationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [{ status = "all" }, all, rooms] = await Promise.all([searchParams, getLandlordReservations(), roomsByBedId()]);
  const reservations = all.filter((r) => bookingStage(r.status) === "reservation");
  const active = reservations.filter((r) => r.status === "reserved").length;
  const requested = reservations.filter((r) => r.status === "reserved" && r.bookingRequestedAt).length;
  const expired = reservations.filter((r) => r.status === "expired").length;
  const cancelled = reservations.filter((r) => r.status === "cancelled").length;

  return (
    <>
      <h1 className="text-2xl">Reservations</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Students holding a bed before you confirm it. A reservation is not a booking yet: press Confirm booking to turn it into a booking, or it expires. Booking requests are students who asked you to confirm.
      </p>

      {reservations.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Inbox}
            title="No reservations yet"
            body="When a student reserves one of your beds, it appears here."
          />
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-5">
            <StatCard label="All reservations" value={String(reservations.length)} icon={Inbox} tone="teal" href="/landlord/reservations" />
            <StatCard label="Booking requests" value={String(requested)} icon={BellRing} tone="coral" href="/landlord/reservations?status=requested" />
            <StatCard label="Active holds" value={String(active)} icon={Clock} tone="coral" href="/landlord/reservations?status=reserved" />
            <StatCard label="Expired" value={String(expired)} icon={CalendarClock} tone="neutral" href="/landlord/reservations?status=expired" />
            <StatCard label="Cancelled" value={String(cancelled)} icon={XCircle} tone="neutral" href="/landlord/reservations?status=cancelled" />
          </div>
          <LandlordReservationsList key={status} stage="reservation" initialFilter={status} reservations={reservations} roomsByBedId={rooms} />
        </>
      )}
    </>
  );
}
