"use client";

import { useState } from "react";

import { PaginationControls } from "@/components/pagination-controls";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";
import { usePagination } from "@/lib/use-pagination";

type Occupant = { id: string; unitId: string };
type Room = { label: string; propertyName: string };

export function TenantsList({ occupants, roomsByUnitId }: { occupants: Occupant[]; roomsByUnitId: Map<string, Room> }) {
  const [view, setView] = useState<ViewMode>("grid");
  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(occupants, 10);

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
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pageItems.map((occupant) => {
                const room = roomsByUnitId.get(occupant.unitId);
                return (
                  <tr key={occupant.id}>
                    <td className="px-3 py-2 text-muted-foreground">{room?.propertyName ?? "—"}</td>
                    <td className="px-3 py-2 font-semibold text-foreground">{room?.label ?? occupant.unitId.slice(0, 8)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {view === "rows" && (
        <div className="divide-y divide-border rounded-md border border-border">
          {pageItems.map((occupant) => {
            const room = roomsByUnitId.get(occupant.unitId);
            return (
              <div key={occupant.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
                <span className="font-semibold text-foreground">{room?.label ?? occupant.unitId.slice(0, 8)}</span>
                <span className="text-xs text-muted-foreground">{room?.propertyName ?? "—"}</span>
              </div>
            );
          })}
        </div>
      )}

      {view === "grid" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pageItems.map((occupant) => {
            const room = roomsByUnitId.get(occupant.unitId);
            return (
              <div key={occupant.id} className="rounded-md border border-border p-3.5">
                <p className="font-semibold text-foreground">{room?.label ?? occupant.unitId.slice(0, 8)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{room?.propertyName ?? "—"}</p>
              </div>
            );
          })}
        </div>
      )}

      <PaginationControls page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} />
    </div>
  );
}
