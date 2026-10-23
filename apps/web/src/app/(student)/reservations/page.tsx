import type { Metadata } from "next";
import Link from "next/link";
import { Timer } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ReceiptsTable } from "@/components/payments/receipts-table";
import { getMyReceipts } from "@/lib/receipts";
import { getMyReservations } from "@/lib/reservations";
import { ReservationsList } from "./reservations-list";

export const metadata: Metadata = { title: "My reservations" };

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; track?: string }>;
}) {
  const [reservations, { new: justReservedId, track: trackId }, receipts] = await Promise.all([getMyReservations(), searchParams, getMyReceipts()]);

  return (
    <>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#ae5528]">Your room holds</p>
      <h1 className="ch-student-page__title mt-3">My reservations</h1>
      <p className="ch-student-page__lede">A reservation is free and holds an available bed while you view the room and agree terms with the landlord.</p>
      {reservations.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Timer}
            title="No reservations yet"
            body="When you reserve a room, it appears here with its countdown and status."
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
        <ReservationsList reservations={reservations} highlightId={justReservedId} trackId={trackId} />
      )}
      {!!receipts?.length && (
        <section aria-labelledby="receipts-heading" className="mt-10">
          <h2 id="receipts-heading" className="text-xl">Payment receipts</h2>
          <p className="mt-1 text-sm text-muted-foreground">Payments your landlord recorded. A copy was emailed to you.</p>
          <div className="mt-4"><ReceiptsTable receipts={receipts} showStudent={false} /></div>
        </section>
      )}
    </>
  );
}
