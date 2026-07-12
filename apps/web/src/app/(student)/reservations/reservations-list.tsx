"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PaymentStatus, Reservation } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusChip } from "@/components/status-chip";
import { MessageButton } from "@/components/chat/message-button";
import { api } from "@/lib/api";
import { formatUgx } from "@/lib/format";

const STATUS_LABEL: Record<Reservation["status"], string> = {
  held: "Holding your room",
  payment_pending: "Payment pending",
  payment_failed: "Payment failed",
  fulfilled: "Reserved",
  cancelled: "Cancelled",
  refunded: "Refunded",
  expired: "Hold expired",
};

const STATUS_TONE: Record<Reservation["status"], "success" | "warning" | "destructive" | "neutral"> = {
  held: "warning",
  payment_pending: "warning",
  payment_failed: "destructive",
  fulfilled: "success",
  cancelled: "neutral",
  refunded: "neutral",
  expired: "neutral",
};

function formatCountdown(holdExpiresAt: string | null): string | null {
  if (!holdExpiresAt) return null;
  const ms = new Date(holdExpiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expiring…";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m left`;
}

// Polls payment-status while a hold is still pending payment (FRONTEND.md §7
// flow 4: redirect to checkoutUrl, then poll on return) — /reservations/mine
// only returns the reservation row, not payment state, so this is the one
// place that needs the per-id endpoint.
function usePaymentPoll(reservationId: string, active: boolean) {
  const router = useRouter();
  const [status, setStatus] = useState<PaymentStatus | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const result = await api<{ status: PaymentStatus }>(
          `/reservations/${reservationId}/payment-status`,
        );
        if (cancelled) return;
        setStatus(result.status);
        if (result.status !== "pending") {
          clearInterval(interval);
          router.refresh();
        }
      } catch {
        // Transient — next tick retries.
      }
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [reservationId, active, router]);

  return status;
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
      {pending ? "Cancelling…" : "Cancel hold"}
    </Button>
  );
}

function MoveInButton({ reservationId }: { reservationId: string }) {
  const [pending, setPending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function confirm() {
    setPending(true);
    try {
      await api(`/reservations/${reservationId}/move-in`, { method: "POST" });
      setConfirmed(true);
    } finally {
      setPending(false);
    }
  }

  if (confirmed) {
    return <StatusChip tone="success">Move-in confirmed</StatusChip>;
  }
  return (
    <Button type="button" size="sm" disabled={pending} onClick={confirm}>
      {pending ? "Confirming…" : "Confirm move-in"}
    </Button>
  );
}

function ReservationCard({ reservation }: { reservation: Reservation }) {
  const paymentStatus = usePaymentPoll(reservation.id, reservation.status === "held");
  const countdown = formatCountdown(reservation.holdExpiresAt);

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={STATUS_TONE[reservation.status]}>
              {STATUS_LABEL[reservation.status]}
            </StatusChip>
            {reservation.status === "held" && paymentStatus === "pending" && (
              <StatusChip tone="warning">Confirming payment…</StatusChip>
            )}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {formatUgx(reservation.feeAmountUgx)} reservation fee
            {countdown && reservation.status === "held" ? ` · ${countdown}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(reservation.status === "held" || reservation.status === "payment_pending") && (
            <CancelButton reservationId={reservation.id} />
          )}
          {reservation.status === "fulfilled" && (
            <MoveInButton reservationId={reservation.id} />
          )}
          {reservation.status !== "cancelled" &&
            reservation.status !== "refunded" &&
            reservation.status !== "expired" && (
              <MessageButton reservationId={reservation.id} messagesHref="/messages" />
            )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ReservationsList({ reservations }: { reservations: Reservation[] }) {
  return (
    <div className="mt-6 space-y-3">
      {reservations.map((reservation) => (
        <ReservationCard key={reservation.id} reservation={reservation} />
      ))}
    </div>
  );
}
