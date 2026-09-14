"use client";

import { useEffect, useRef } from "react";
import { Bed, Calendar, Clock, Lock, Phone, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/status-chip";
import type { RoomUnit } from "@/lib/room-management";

interface BedspaceDrawerProps {
  open: boolean;
  onClose: () => void;
  room: RoomUnit | null;
  onToggleBedBlock?: (bedId: string, blocked: boolean) => void;
}

export function BedspaceDrawer({
  open,
  onClose,
  room,
  onToggleBedBlock,
}: BedspaceDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || !room) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        ref={drawerRef}
        className="w-full max-w-md bg-card border-l border-border h-full flex flex-col shadow-xl animate-in slide-in-from-right duration-250 text-foreground"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border p-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                <Bed className="size-4" />
              </span>
              <h2 className="text-lg font-bold font-heading">{room.roomCode}</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {room.roomTypeTitle} · {room.capacity} bedspaces ·{" "}
              {room.buildingName ? `${room.buildingName}, ` : ""}
              {room.floorLabel || "Standard floor"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close bedspaces drawer"
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Occupancy Indicator */}
        <div className="bg-muted/40 px-5 py-3 border-b border-border flex items-center justify-between text-xs">
          <span className="font-semibold text-muted-foreground">Occupancy</span>
          <span className="font-bold text-foreground tabular-nums">
            {room.occupiedBeds} of {room.totalBeds} bedspaces occupied
          </span>
        </div>

        {/* Bed List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {room.beds.map((bed, idx) => {
            const isOccupied =
              bed.status === "occupied" ||
              bed.status === "booked" ||
              bed.status === "reserved";

            let tone: "success" | "warning" | "destructive" | "neutral" = "success";
            let statusLabel = "Available";

            if (bed.blocked) {
              tone = "destructive";
              statusLabel = "Bed Blocked";
            } else if (bed.status === "occupied") {
              tone = "neutral";
              statusLabel = "Occupied";
            } else if (bed.status === "booked") {
              tone = "warning";
              statusLabel = "Booked (Awaiting Move-in)";
            } else if (bed.status === "reserved") {
              tone = "warning";
              statusLabel = "Temporary Hold (24h)";
            }

            return (
              <div
                key={bed.id}
                className={`rounded-xl border p-4 transition-all ${
                  bed.blocked
                    ? "border-destructive/30 bg-destructive-subtle/30"
                    : isOccupied
                    ? "border-border bg-muted/20"
                    : "border-teal-200/60 bg-teal-50/20 dark:border-teal-900 dark:bg-teal-950/20"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-foreground">
                      {bed.label || `Bedspace ${idx + 1}`}
                    </span>
                  </div>
                  <StatusChip tone={tone}>{statusLabel}</StatusChip>
                </div>

                {/* Tenant / Reservation details */}
                {isOccupied ? (
                  <div className="mt-3 space-y-1.5 rounded-lg bg-card p-3 border border-border/80 text-xs">
                    {bed.studentName && (
                      <div className="flex items-center gap-2 text-foreground font-medium">
                        <User className="size-3.5 text-muted-foreground" />
                        <span>{bed.studentName}</span>
                      </div>
                    )}
                    {bed.studentPhone && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="size-3.5" />
                        <span className="font-mono">{bed.studentPhone}</span>
                      </div>
                    )}
                    {bed.reservedExpiresAt && bed.status === "reserved" && (
                      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-medium">
                        <Clock className="size-3.5" />
                        <span>
                          Hold expires {new Date(bed.reservedExpiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    )}
                    {bed.bookedAt && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="size-3.5" />
                        <span>Booked on {new Date(bed.bookedAt).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                ) : bed.blocked ? (
                  <p className="mt-2 text-xs text-destructive">
                    {bed.blockedReason || "Bedspace manually blocked by landlord."}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Available for student reservation on verified listing.
                  </p>
                )}

                {/* Bed-level Block Action */}
                {!isOccupied && onToggleBedBlock && (
                  <div className="mt-3 pt-3 border-t border-border/60 flex justify-end">
                    <button
                      type="button"
                      onClick={() => onToggleBedBlock(bed.id, !bed.blocked)}
                      className="text-xs font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Lock className="size-3.5" />
                      {bed.blocked ? "Unblock Bedspace" : "Block Bedspace"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4 bg-card">
          <Button variant="secondary" className="w-full" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
