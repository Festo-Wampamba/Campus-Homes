"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import type { StudentReservationView } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { StatusChip } from "@/components/status-chip";
import { MessageButton } from "@/components/chat/message-button";
import { BookingTracker } from "@/components/reservations/booking-tracker";
import { api, ApiError } from "@/lib/api";
import { formatDateTime, formatUgx, roomCategoryLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

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

const LIVE_STATUSES = new Set<StudentReservationView["status"]>(["reserved", "booked", "occupied"]);

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null;
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join(", ");
  }
  return fallback;
}

// The current minute, ticking on the client. The server snapshot is null so
// the countdown renders only in the browser and never mismatches hydration.
function subscribeMinute(onChange: () => void) {
  const timer = setInterval(onChange, 30_000);
  return () => clearInterval(timer);
}
function useMinuteNow(): number | null {
  return useSyncExternalStore(
    subscribeMinute,
    () => Math.floor(Date.now() / 60_000) * 60_000,
    () => null,
  );
}

function formatCountdown(reservedExpiresAt: string, now: number): string {
  const ms = new Date(reservedExpiresAt).getTime() - now;
  if (ms <= 0) return "expiring";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m left`;
}

// The student asks the landlord to confirm (book) the room; the landlord
// still books it from their side after agreeing terms and payment.
function RequestBookingButton({ reservationId, requestedAt }: { reservationId: string; requestedAt: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (requestedAt) return <StatusChip tone="neutral">Booking requested</StatusChip>;

  async function request() {
    setError(null);
    setPending(true);
    try {
      await api(`/reservations/${reservationId}/request-booking`, { method: "POST" });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't send your booking request. Try again."));
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" disabled={pending} onClick={() => void request()}>
        {pending ? "Sending…" : "Request booking"}
      </Button>
      {error && (
        <p role="alert" className="max-w-48 text-right text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function CancelButton({ reservationId, propertyName }: { reservationId: string; propertyName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setError(null);
    setPending(true);
    try {
      await api(`/reservations/${reservationId}/cancel`, { method: "POST" });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't cancel the reservation. Try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Cancel reservation
      </Button>
      <Dialog open={open} onOpenChange={setOpen} size="sm">
        <DialogHeader
          title="Cancel this reservation?"
          description={propertyName}
          onClose={() => setOpen(false)}
        />
        <DialogBody>
          <p className="text-sm text-foreground">
            The room goes back on the market straight away and another student can reserve it.
          </p>
          {error && (
            <p role="alert" className="mt-3 text-sm font-semibold text-destructive">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Keep it
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={cancel}>
            {pending ? "Cancelling…" : "Cancel reservation"}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

function MoveInButton({ reservationId }: { reservationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    setPending(true);
    try {
      await api(`/reservations/${reservationId}/move-in`, { method: "POST" });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't confirm your move-in. Try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" disabled={pending} onClick={confirm}>
        {pending ? "Confirming…" : "Confirm move-in"}
      </Button>
      {error && (
        <p role="alert" className="max-w-48 text-right text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function ReservationCard({
  reservation,
  highlighted,
  tracked,
  now,
}: {
  reservation: StudentReservationView;
  highlighted: boolean;
  tracked: boolean;
  now: number | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isTrackerOpen, setIsTrackerOpen] = useState(tracked);
  const heldUntil = reservation.status === "reserved" ? reservation.reservedExpiresAt : null;
  const trackerId = `booking-tracker-${reservation.id}`;

  useEffect(() => {
    if (highlighted || tracked) ref.current?.scrollIntoView({ block: "center" });
  }, [highlighted, tracked]);

  return (
    <div ref={ref} id={`reservation-${reservation.id}`}>
      <Card className={cn("rounded-[18px] border-[#dbe7e5] shadow-[0_8px_24px_rgba(23,63,67,0.04)]", highlighted && "ring-2 ring-teal-600 ring-offset-2 ring-offset-background")}>
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
              {highlighted && <StatusChip tone="success">Just reserved</StatusChip>}
            </div>

            <p className="mt-2 text-sm text-foreground">
              {roomCategoryLabel(reservation.roomCategory)} ({reservation.bedLabel}) · sleeps{" "}
              {reservation.roomCapacity} · {formatUgx(reservation.rentPerTermUgx)} / semester
              {reservation.depositUgx != null && ` + ${formatUgx(reservation.depositUgx)} deposit`}
            </p>
            {heldUntil && (
              <p className="mt-1 text-sm font-semibold text-foreground">
                Held for you until {formatDateTime(heldUntil)}
                {now !== null && ` · ${formatCountdown(heldUntil, now)}`}
              </p>
            )}
            {(reservation.bookingFeeCollectedUgx || reservation.depositCollectedUgx) && (
              <p className="mt-1 text-sm text-muted-foreground">
                {[
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
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Ref {reservation.id.slice(0, 8).toUpperCase()}
              {reservation.reservedAt && ` · Reserved ${formatDateTime(reservation.reservedAt)}`}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {reservation.status === "reserved" && (
              <RequestBookingButton reservationId={reservation.id} requestedAt={reservation.bookingRequestedAt ?? null} />
            )}
            {reservation.status === "reserved" && (
              <CancelButton reservationId={reservation.id} propertyName={reservation.propertyName} />
            )}
            {reservation.status === "booked" && <MoveInButton reservationId={reservation.id} />}
            {LIVE_STATUSES.has(reservation.status) && (
              <MessageButton reservationId={reservation.id} messagesHref="/messages" />
            )}
          </div>
        </CardContent>
        <div className="border-t border-[#edf2f1] px-5 py-3">
          <button
            type="button"
            aria-expanded={isTrackerOpen}
            aria-controls={trackerId}
            onClick={() => setIsTrackerOpen((open) => !open)}
            className="flex min-h-11 w-full items-center justify-between gap-2 text-sm font-semibold text-teal-700 dark:text-teal-300"
          >
            Track booking
            <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-200", isTrackerOpen && "rotate-180")} />
          </button>
          {isTrackerOpen && (
            <div className="pb-2 pt-1">
              <BookingTracker reservation={reservation} id={trackerId} />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// Live reservations first; within each group the API's newest-first order.
export function sortLiveFirst(reservations: StudentReservationView[]): StudentReservationView[] {
  return [...reservations].sort(
    (a, b) => Number(LIVE_STATUSES.has(b.status)) - Number(LIVE_STATUSES.has(a.status)),
  );
}

export function ReservationsList({
  reservations,
  highlightId,
  trackId,
}: {
  reservations: StudentReservationView[];
  highlightId?: string;
  // Opens this reservation's booking tracker (links from the dashboard).
  trackId?: string;
}) {
  const now = useMinuteNow();

  return (
    <div className="mt-6 space-y-3">
      {sortLiveFirst(reservations).map((reservation) => (
        <ReservationCard
          key={reservation.id}
          reservation={reservation}
          highlighted={reservation.id === highlightId}
          tracked={reservation.id === trackId}
          now={now}
        />
      ))}
    </div>
  );
}
