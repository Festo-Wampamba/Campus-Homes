import type { Metadata } from "next";
import Link from "next/link";
import { Timer } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { getMyReservations } from "@/lib/reservations";
import { ReservationsList } from "./reservations-list";

export const metadata: Metadata = { title: "My reservations" };

export default async function ReservationsPage() {
  const reservations = await getMyReservations();

  return (
    <>
      <h1 className="text-2xl">My reservations</h1>
      {reservations.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Timer}
            title="No reservations yet"
            body="When you place a 72-hour hold on a room, it appears here with its countdown and payment status."
            action={
              <Link
                href="/search"
                className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-xs transition-colors duration-150 hover:bg-teal-700"
              >
                Find housing near campus
              </Link>
            }
          />
        </div>
      ) : (
        <ReservationsList reservations={reservations} />
      )}
    </>
  );
}
