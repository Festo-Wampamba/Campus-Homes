"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { StudentReservationView } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusChip } from "@/components/status-chip";
import { MessageButton } from "@/components/chat/message-button";
import { api } from "@/lib/api";
import { formatUgx, roomCategoryLabel } from "@/lib/format";

const STATUS_LABEL: Record<StudentReservationView["status"], string> = {
  reserved: "Reserved",
  booked: "Booked",
  occupied: "Moved in",
  released: "Released",
  cancelled: "Cancelled",
  refunded: "Refunded",
  expired: "Reservation expired",
};

const STATUS_TONE: Record<StudentReservationView["status"], "success" | "warning" | "destructive" | "neutral"> = {
  reserved: "warning",
  booked: "warning",
  occupied: "success",
  released: "destructive",
  cancelled: "neutral",
  refunded: "neutral",
  expired: "neutral",
};

function formatCountdown(reservedExpiresAt: string | null): string | null {
  if (!reservedExpiresAt) return null;
  const ms = new Date(reservedExpiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expiring…";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m left`;
}

function CancelButton({ reservationId }: { reservationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function cancel() {
    setPending(true);
    try {
      await api(`/reservations/${reservationId}/cancel`, { method: "POST" });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={cancel}>
      {pending ? "Cancelling…" : "Cancel reservation"}
    </Button>
  );
}

function MoveInButton({ reservationId }: { reservationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    try {
      await api(`/reservations/${reservationId}/move-in`, { method: "POST" });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" size="sm" disabled={pending} onClick={confirm}>
      {pending ? "Confirming…" : "Confirm move-in"}
    </Button>
  );
}

function ReservationCard({ reservation }: { reservation: StudentReservationView }) {
  const countdown = formatCountdown(reservation.reservedExpiresAt);

  return (
    <Card>
      <CardContent className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <Link
            href={`/listings/${reservation.listingId}`}
            className="font-semibold text-foreground hover:underline"
          >
            {reservation.propertyName}
          </Link>
          <p className="text-sm text-muted-foreground">{reservation.propertyStreetAddress}</p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusChip tone={STATUS_TONE[reservation.status]}>
              {STATUS_LABEL[reservation.status]}
            </StatusChip>
          </div>

          <p className="mt-2 text-sm text-foreground">
            {roomCategoryLabel(reservation.roomCategory)} ({reservation.bedLabel}) · sleeps{" "}
            {reservation.roomCapacity} · {formatUgx(reservation.rentPerTermUgx)} / semester
            {reservation.depositUgx != null && ` + ${formatUgx(reservation.depositUgx)} deposit`}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {reservation.status === "reserved" && countdown
              ? `Reserved for you — ${countdown}`
              : null}
            {(reservation.bookingFeeCollectedUgx || reservation.depositCollectedUgx) &&
              [
                reservation.bookingFeeCollectedUgx
                  ? `${formatUgx(reservation.bookingFeeCollectedUgx)} booking fee`
                  : null,
                reservation.depositCollectedUgx
                  ? `${formatUgx(reservation.depositCollectedUgx)} deposit`
                  : null,
              ]
                .filter(Boolean)
                .join(" + ") + " recorded"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {reservation.status === "reserved" && <CancelButton reservationId={reservation.id} />}
          {reservation.status === "booked" && <MoveInButton reservationId={reservation.id} />}
          {reservation.status !== "cancelled" &&
            reservation.status !== "refunded" &&
            reservation.status !== "expired" &&
            reservation.status !== "released" && (
              <MessageButton reservationId={reservation.id} messagesHref="/messages" />
            )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ReservationsList({ reservations }: { reservations: StudentReservationView[] }) {
  return (
    <div className="mt-6 space-y-3">
      {reservations.map((reservation) => (
        <ReservationCard key={reservation.id} reservation={reservation} />
      ))}
    </div>
  );
}
