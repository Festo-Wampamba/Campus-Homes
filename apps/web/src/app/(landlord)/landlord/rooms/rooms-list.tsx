"use client";

import { useState } from "react";
import type { PropertyRoom } from "@campushomes/shared";

import { PaginationControls } from "@/components/pagination-controls";
import { StatusChip } from "@/components/status-chip";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";
import { formatUgx } from "@/lib/format";
import { usePagination } from "@/lib/use-pagination";

const ROOM_CATEGORY_LABEL: Record<string, string> = {
  single: "Single",
  double: "Double",
  triple: "Triple",
  quad: "Quad",
  other: "Other",
};

function reservationChip(status: PropertyRoom["reservationStatus"]) {
  switch (status) {
    case "held":
      return <StatusChip tone="warning">Held</StatusChip>;
    case "payment_pending":
      return <StatusChip tone="warning">Payment pending</StatusChip>;
    case "fulfilled":
      return <StatusChip tone="neutral">Occupied</StatusChip>;
    default:
      return <StatusChip tone="success">Available</StatusChip>;
  }
}

type Row = { room: PropertyRoom; propertyName: string };

export function RoomsList({ rows }: { rows: Row[] }) {
  const [view, setView] = useState<ViewMode>("grid");
  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(rows, 10);

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <ViewToggle view={view} onChange={setView} />
      </div>

      {view === "list" && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-3 py-2">Property</th>
                <th scope="col" className="px-3 py-2">Room</th>
                <th scope="col" className="px-3 py-2">Type</th>
                <th scope="col" className="px-3 py-2">Sleeps</th>
                <th scope="col" className="px-3 py-2">Price / semester</th>
                <th scope="col" className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pageItems.map(({ room, propertyName }) => (
                <tr key={room.id}>
                  <td className="px-3 py-2 text-muted-foreground">{propertyName}</td>
                  <td className="px-3 py-2 font-semibold text-foreground">{room.label}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {ROOM_CATEGORY_LABEL[room.roomCategory] ?? room.roomCategory}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{room.capacity}</td>
                  <td className="px-3 py-2 text-muted-foreground">{formatUgx(room.pricePerTermUgx)}</td>
                  <td className="px-3 py-2">{reservationChip(room.reservationStatus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === "rows" && (
        <div className="divide-y divide-border rounded-md border border-border">
          {pageItems.map(({ room, propertyName }) => (
            <div key={room.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">{room.label}</p>
                <p className="text-xs text-muted-foreground">
                  {propertyName} · {ROOM_CATEGORY_LABEL[room.roomCategory] ?? room.roomCategory} · Sleeps {room.capacity} · {formatUgx(room.pricePerTermUgx)}
                </p>
              </div>
              {reservationChip(room.reservationStatus)}
            </div>
          ))}
        </div>
      )}

      {view === "grid" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pageItems.map(({ room, propertyName }) => (
            <div key={room.id} className="rounded-md border border-border p-3.5">
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="font-semibold text-foreground">{room.label}</p>
                {reservationChip(room.reservationStatus)}
              </div>
              <p className="mb-2 text-xs text-muted-foreground">{propertyName}</p>
              <dl className="space-y-1 text-xs">
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Type</dt><dd className="text-foreground">{ROOM_CATEGORY_LABEL[room.roomCategory] ?? room.roomCategory}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Sleeps</dt><dd className="text-foreground">{room.capacity}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Price / semester</dt><dd className="text-foreground">{formatUgx(room.pricePerTermUgx)}</dd></div>
              </dl>
            </div>
          ))}
        </div>
      )}

      <PaginationControls page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} />
    </div>
  );
}
