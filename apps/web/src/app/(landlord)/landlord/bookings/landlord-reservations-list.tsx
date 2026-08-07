"use client";

import type { LandlordReservationView } from "@campushomes/shared";

import { Card, CardContent } from "@/components/ui/card";
import { StatusChip } from "@/components/status-chip";
import { MessageButton } from "@/components/chat/message-button";

const STATUS_LABEL: Record<LandlordReservationView["status"], string> = {
  held: "Holding",
  payment_pending: "Payment pending",
  payment_failed: "Payment failed",
  fulfilled: "Reserved",
  cancelled: "Cancelled",
  refunded: "Refunded",
  expired: "Hold expired",
};

const STATUS_TONE: Record<
  LandlordReservationView["status"],
  "success" | "warning" | "destructive" | "neutral"
> = {
  held: "warning",
  payment_pending: "warning",
  payment_failed: "destructive",
  fulfilled: "success",
  cancelled: "neutral",
  refunded: "neutral",
  expired: "neutral",
};

export function LandlordReservationsList({
  reservations,
}: {
  reservations: LandlordReservationView[];
}) {
  return (
    <div className="mt-6 space-y-3">
      {reservations.map((reservation) => (
        <Card key={reservation.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <StatusChip tone={STATUS_TONE[reservation.status]}>
              {STATUS_LABEL[reservation.status]}
            </StatusChip>
            <MessageButton reservationId={reservation.id} messagesHref="/landlord/messages" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
