"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, apiErrorMessage } from "@/lib/api";
import {
  UNIT_BLOCK_REASONS,
  type RoomUnit,
  type UnitBlock,
  type UnitBlockReason,
} from "@/lib/room-management";

interface UnitBlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: RoomUnit | null;
  onBlockUpdated: (updatedRoom: RoomUnit) => void;
}

export function UnitBlockDialog({
  open,
  onOpenChange,
  room,
  onBlockUpdated,
}: UnitBlockDialogProps) {
  const isBlocked = Boolean(room?.activeBlock);

  const [reason, setReason] = useState<UnitBlockReason>("maintenance");
  const [startsAt, setStartsAt] = useState(
    new Date().toISOString().slice(0, 16),
  );
  const [endsAt, setEndsAt] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApplyBlock(e: React.FormEvent) {
    e.preventDefault();
    if (!room) return;

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        reason,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        notes: notes.trim() || null,
      };

      const block = await api<UnitBlock>(
        `/room-management/rooms/${room.id}/blocks`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );

      const updated: RoomUnit = {
        ...room,
        activeBlock: block,
        derivedStatus: new Date(block.startsAt) <= new Date() ? "blocked" : room.derivedStatus,
      };

      onBlockUpdated(updated);
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not apply maintenance block."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClearBlock() {
    if (!room || !room.activeBlock) return;

    setSubmitting(true);
    setError(null);

    try {
      await api(
        `/room-management/rooms/${room.id}/blocks/${room.activeBlock.id}/clear`,
        {
          method: "POST",
        },
      );

      const activeBeds = room.beds.filter((b) => !b.blocked);
      const occupiedCount = activeBeds.filter(
        (b) => b.status === "occupied" || b.status === "booked" || b.status === "reserved",
      ).length;

      let derivedStatus: RoomUnit["derivedStatus"] = "available";
      if (occupiedCount >= activeBeds.length && activeBeds.length > 0) {
        derivedStatus = "fully_occupied";
      } else if (occupiedCount > 0) {
        derivedStatus = "partially_occupied";
      }

      const updated: RoomUnit = {
        ...room,
        activeBlock: null,
        derivedStatus,
      };

      onBlockUpdated(updated);
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not clear maintenance block."));
    } finally {
      setSubmitting(false);
    }
  }

  if (!room) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="md">
      <form onSubmit={handleApplyBlock} className="flex flex-col h-full">
        <DialogHeader
          title={
            isBlocked
              ? `Manage Maintenance Block — ${room.roomCode}`
              : `Block Room for Maintenance — ${room.roomCode}`
          }
          onClose={() => onOpenChange(false)}
          description={
            isBlocked
              ? "This room is currently blocked from student bookings. You can review block details or restore availability immediately."
              : "Temporarily block this physical room from student availability. Blocking takes effect immediately without waiting for Operations review."
          }
        />

        <DialogBody className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/20 bg-destructive-subtle p-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          {isBlocked ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive-subtle/30 p-4 space-y-3">
              <div className="flex items-center gap-2 text-destructive font-bold text-sm">
                <AlertTriangle className="size-4" />
                <span>Room is currently blocked</span>
              </div>
              <div className="space-y-1.5 text-xs text-foreground">
                <p>
                  <strong>Reason:</strong>{" "}
                  {UNIT_BLOCK_REASONS.find((r) => r.value === room.activeBlock?.reason)?.label ??
                    room.activeBlock?.reason}
                </p>
                <p>
                  <strong>Started:</strong>{" "}
                  {room.activeBlock?.startsAt
                    ? new Date(room.activeBlock.startsAt).toLocaleString()
                    : "Immediate"}
                </p>
                {room.activeBlock?.endsAt && (
                  <p>
                    <strong>Scheduled end:</strong>{" "}
                    {new Date(room.activeBlock.endsAt).toLocaleString()}
                  </p>
                )}
                {room.activeBlock?.notes && (
                  <p className="bg-card/70 p-2 rounded border border-border mt-2">
                    <strong>Notes:</strong> {room.activeBlock.notes}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <>
              <div>
                <Label htmlFor="block-reason">Block Reason</Label>
                <select
                  id="block-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value as UnitBlockReason)}
                  className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                >
                  {UNIT_BLOCK_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="block-starts">Block Start Date & Time</Label>
                  <Input
                    id="block-starts"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    required
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="block-ends">Scheduled End Date (optional)</Label>
                  <Input
                    id="block-ends"
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    className="mt-1.5"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Leave blank if indefinite until manually cleared.
                  </p>
                </div>
              </div>

              <div>
                <Label htmlFor="block-notes">Internal Notes & Description</Label>
                <Textarea
                  id="block-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Broken water pipe repair scheduled with plumber, room repainting..."
                  className="mt-1.5 min-h-20"
                />
              </div>
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>

          {isBlocked ? (
            <Button
              type="button"
              onClick={handleClearBlock}
              disabled={submitting}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {submitting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Unlock className="mr-2 size-4" />
              )}
              Clear Block (Restore Availability)
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={submitting}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {submitting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Lock className="mr-2 size-4" />
              )}
              Apply Block Immediately
            </Button>
          )}
        </DialogFooter>
      </form>
    </Dialog>
  );
}
