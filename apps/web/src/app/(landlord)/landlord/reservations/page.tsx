import type { Metadata } from "next";
import { Inbox } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { getLandlordReservations } from "@/lib/landlord";
import { LandlordReservationsList } from "./landlord-reservations-list";

export const metadata: Metadata = { title: "Reservations" };

export default async function LandlordReservationsPage() {
  const reservations = await getLandlordReservations();

  return (
    <>
      <h1 className="text-2xl">Reservations</h1>
      {reservations.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Inbox}
            title="No reservations yet"
            body="When a student places a hold on one of your units, it appears here."
          />
        </div>
      ) : (
        <LandlordReservationsList reservations={reservations} />
      )}
    </>
  );
}
