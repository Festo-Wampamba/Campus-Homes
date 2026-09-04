import type { Metadata } from "next";
import { CheckCircle2, Clock, Inbox, XCircle } from "lucide-react";

import { getLandlordReservations, getMyProperties, getPropertyDetail } from "@/lib/landlord";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/landlord/analytics/stat-card";
import { LandlordReservationsList } from "./landlord-reservations-list";

export const metadata: Metadata = { title: "Bookings" };

export default async function LandlordBookingsPage() {
  const [reservations, properties] = await Promise.all([getLandlordReservations(), getMyProperties()]);
  const details = await Promise.all(properties.map((p) => getPropertyDetail(p.id)));

  const roomsByBedId = new Map<
    string,
    { label: string; propertyName: string; roomCategory: string; pricePerTermUgx: number }
  >();
  details.forEach((detail, i) => {
    for (const room of detail?.rooms ?? []) {
      for (const bed of room.beds) {
        roomsByBedId.set(bed.id, {
          label: room.label,
          propertyName: properties[i].name,
          roomCategory: room.roomCategory,
          pricePerTermUgx: room.pricePerTermUgx,
        });
      }
    }
  });

  const activeCount = reservations.filter((r) => r.status === "reserved" || r.status === "booked").length;
  const fulfilledCount = reservations.filter((r) => r.status === "occupied").length;
  const fellThroughCount = reservations.filter((r) =>
    ["cancelled", "expired", "released"].includes(r.status),
  ).length;

  return (
    <>
      <h1 className="text-2xl">Bookings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every reservation ever placed on your units, newest first.
      </p>

      {reservations.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Inbox}
            title="No bookings yet"
            body="When a student reserves one of your beds, it appears here."
          />
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Total bookings" value={String(reservations.length)} icon={Inbox} tone="teal" />
            <StatCard label="Active now" value={String(activeCount)} icon={Clock} tone="coral" />
            <StatCard label="Fulfilled" value={String(fulfilledCount)} icon={CheckCircle2} tone="teal" />
            <StatCard label="Fell through" value={String(fellThroughCount)} icon={XCircle} tone="neutral" />
          </div>

          <LandlordReservationsList reservations={reservations} roomsByBedId={roomsByBedId} />
        </>
      )}
    </>
  );
}
