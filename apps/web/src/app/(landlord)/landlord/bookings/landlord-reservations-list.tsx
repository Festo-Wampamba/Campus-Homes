"use client";

import { useMemo, useState } from "react";
import type { LandlordReservationView } from "@campushomes/shared";
import { CheckCircle2, Search } from "lucide-react";

import { api } from "@/lib/api";
import { formatUgx, roomCategoryLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/status-chip";
import { PaginationControls } from "@/components/pagination-controls";
import { usePagination } from "@/lib/use-pagination";
import { MessageButton } from "@/components/chat/message-button";

type RoomInfo = { label: string; propertyName: string; roomCategory: string; pricePerTermUgx: number };

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

const FILTERS: { key: "all" | LandlordReservationView["status"]; label: string }[] = [
  { key: "all", label: "All" },
  { key: "held", label: "Holding" },
  { key: "payment_pending", label: "Payment pending" },
  { key: "fulfilled", label: "Reserved" },
  { key: "cancelled", label: "Cancelled" },
  { key: "expired", label: "Hold expired" },
  { key: "refunded", label: "Refunded" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function holdCountdown(holdExpiresAt: string) {
  const ms = new Date(holdExpiresAt).getTime() - Date.now();
  if (ms <= 0) return "expiring";
  const hours = Math.round(ms / (60 * 60 * 1000));
  return hours < 24 ? `${hours}h left` : `${Math.round(hours / 24)}d left`;
}

export function LandlordReservationsList({
  reservations,
  roomsByUnitId,
}: {
  reservations: LandlordReservationView[];
  roomsByUnitId: Map<string, RoomInfo>;
}) {
  const [rows, setRows] = useState(reservations);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<Set<string>>(new Set());

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.status, (map.get(r.status) ?? 0) + 1);
    return map;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      const room = roomsByUnitId.get(r.unitId);
      return (
        room?.label.toLowerCase().includes(q) || room?.propertyName.toLowerCase().includes(q) || false
      );
    });
  }, [rows, filter, query, roomsByUnitId]);

  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(filtered, 12);

  async function confirmMoveIn(id: string) {
    setConfirming((prev) => new Set(prev).add(id));
    try {
      await api(`/reservations/${id}/move-in`, { method: "POST" });
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, moveInConfirmedAt: new Date().toISOString() } : r)),
      );
    } finally {
      setConfirming((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              filter === key
                ? "border-teal-600 bg-teal-50 text-teal-700 dark:bg-teal-100"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {label}
            {key !== "all" && (
              <span className="tabular text-[10px] opacity-70">{counts.get(key) ?? 0}</span>
            )}
          </button>
        ))}
      </div>

      <div className="relative mt-3 max-w-xs">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search room or property…"
          className="h-9 w-full rounded-md border border-border bg-background pr-3 pl-9 text-sm focus:border-teal-600 focus:outline-none"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">No bookings match this filter.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-3 py-2">Property / Room</th>
                <th scope="col" className="px-3 py-2">Status</th>
                <th scope="col" className="px-3 py-2">Booked</th>
                <th scope="col" className="px-3 py-2">Listed rent</th>
                <th scope="col" className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pageItems.map((reservation) => {
                const room = roomsByUnitId.get(reservation.unitId);
                const isPending = confirming.has(reservation.id);
                return (
                  <tr key={reservation.id}>
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-foreground">{room?.label ?? reservation.unitId.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground">
                        {room?.propertyName ?? "—"}
                        {room && ` · ${roomCategoryLabel(room.roomCategory)}`}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusChip tone={STATUS_TONE[reservation.status]}>
                        {STATUS_LABEL[reservation.status]}
                      </StatusChip>
                      {reservation.status === "held" && reservation.holdExpiresAt && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {holdCountdown(reservation.holdExpiresAt)}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{formatDate(reservation.createdAt)}</td>
                    <td className="tabular px-3 py-2.5 text-muted-foreground">
                      {room ? formatUgx(room.pricePerTermUgx) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        {reservation.status === "fulfilled" &&
                          (reservation.moveInConfirmedAt ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                              <CheckCircle2 aria-hidden className="size-3.5" />
                              Moved in
                            </span>
                          ) : (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={isPending}
                              onClick={() => confirmMoveIn(reservation.id)}
                            >
                              {isPending ? "Confirming…" : "Confirm move-in"}
                            </Button>
                          ))}
                        <MessageButton reservationId={reservation.id} messagesHref="/landlord/messages" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <PaginationControls page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
