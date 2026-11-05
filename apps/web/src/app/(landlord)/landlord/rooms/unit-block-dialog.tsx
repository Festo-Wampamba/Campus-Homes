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
  deriveRoomStatus,
  type RoomUnit,
  type UnitBlock,
  type UnitBlockReason,
} from "@/lib/room-management";

interface UnitBlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: RoomUnit | null;
  onBlockUpdated: (updatedRoom: RoomUnit, message: string) => void;
}

export function localDateTimeInput(date = new Date()): string {
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function UnitBlockDialog({
  open,
  onOpenChange,
  room,
  onBlockUpdated,
}: UnitBlockDialogProps) {
  const isBlocked = Boolean(room?.activeBlock);

  const [startImmediately, setStartImmediately] = useState(true);
  const [reason, setReason] = useState<UnitBlockReason>("maintenance");
  const [startsAt, setStartsAt] = useState(
    localDateTimeInput(),
  );
  const [endsAt, setEndsAt] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApplyBlock(e: React.FormEvent) {
    e.preventDefault();
    if (!room) return;

    setError(null);
    const start = startImmediately ? new Date() : new Date(startsAt);
    const end = endsAt ? new Date(endsAt) : null;
    if (!Number.isFinite(start.getTime()) || (end && (!Number.isFinite(end.getTime()) || end <= start || end.getTime() <= Date.now()))) {
      setError("Choose an end time in the future, after the start time, or leave it blank until you clear the block.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        startImmediately,
        reason,
        startsAt: start.toISOString(),
        endsAt: end?.toISOString() ?? null,
        notes: notes.trim() || null,
      };

      const block = await api<UnitBlock & { room?: RoomUnit }>(
        `/room-management/rooms/${room.id}/blocks`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );

      const active = new Date(block.startsAt).getTime() <= Date.now() && (!block.endsAt || new Date(block.endsAt).getTime() > Date.now());
      const updated: RoomUnit = block.room ?? {
        ...room,
        activeBlock: active ? block : room.activeBlock,
        scheduledBlocks: active ? room.scheduledBlocks : [...(room.scheduledBlocks ?? []), block],
        derivedStatus: active ? "blocked" : room.derivedStatus,
      };
      onBlockUpdated(updated, active ? `Room ${room.roomCode} is blocked. Its beds are excluded from availability.` : `Block scheduled for room ${room.roomCode} at ${new Date(block.startsAt).toLocaleString()}.`);
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not apply room block."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClearBlock(block = room?.activeBlock) {
    if (!room || !block) return;

    setSubmitting(true);
    setError(null);

    try {
      const result = await api<{ room?: RoomUnit }>(
        `/room-management/rooms/${room.id}/blocks/${block.id}/clear`,
        {
          method: "POST",
        },
      );

      const activeBlock = room.activeBlock?.id === block.id ? null : room.activeBlock;
      const updated: RoomUnit = result.room ?? {
        ...room,
        activeBlock,
        scheduledBlocks: (room.scheduledBlocks ?? []).filter((item) => item.id !== block.id),
        derivedStatus: deriveRoomStatus(room.beds, activeBlock),
      };
      onBlockUpdated(updated, `Block cleared for room ${room.roomCode}. Availability has been updated.`);
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not clear room block."));
    } finally {
      setSubmitting(false);
    }
  }

  if (!room) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="md" dismissible={!submitting} resizable>
      <form onSubmit={handleApplyBlock} className="flex min-h-0 flex-auto flex-col">
        <DialogHeader
          title={
            isBlocked
              ? `Manage Room Block: ${room.roomCode}`
              : `Block Room: ${room.roomCode}`
          }
          onClose={() => !submitting && onOpenChange(false)}
        />

        <DialogBody className="space-y-4 [&_input]:min-w-0 [&_select]:min-w-0 [&_textarea]:min-w-0">
          <p className="text-sm text-muted-foreground">Only room {room.roomCode} is affected. {isBlocked ? "Review or clear its block below." : "Start immediately or schedule a time; choose an end time or clear it manually."}</p>
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/20 bg-destructive-subtle p-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          {Boolean(room.scheduledBlocks?.length) && <section aria-label="Scheduled blocks" className="space-y-3 rounded-lg border border-border p-3 text-sm">
            <h3 className="font-semibold">Scheduled blocks</h3>
            {room.scheduledBlocks!.map((block) => <div key={block.id} className="space-y-2 border-t border-border pt-2">
              <p>{UNIT_BLOCK_REASONS.find((item) => item.value === block.reason)?.label ?? block.reason}: {new Date(block.startsAt).toLocaleString()} – {block.endsAt ? new Date(block.endsAt).toLocaleString() : "until cleared"}</p>
              <Button type="button" variant="secondary" className="h-auto min-h-11 max-w-full whitespace-normal py-2" disabled={submitting} onClick={() => handleClearBlock(block)}>Cancel scheduled block</Button>
            </div>)}
          </section>}
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

              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={startImmediately} onChange={(event) => setStartImmediately(event.target.checked)} className="size-4 accent-primary" />
                Start immediately
              </label>
              <p className="text-xs text-muted-foreground">Times use your device’s local time zone. An end time must be in the future.</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 [&>div]:min-w-0">
                {!startImmediately && <div>
                  <Label htmlFor="block-starts">Block Start Date & Time</Label>
                  <Input
                    id="block-starts"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    required
                    className="mt-1.5"
                  />
                </div>}
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

        <DialogFooter className="flex-wrap [&_button]:h-auto [&_button]:min-h-11 [&_button]:max-w-full [&_button]:whitespace-normal [&_button]:py-2">
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
              onClick={() => handleClearBlock()}
              disabled={submitting}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {submitting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Unlock className="mr-2 size-4" />
              )}
              Clear Block
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
              {startImmediately ? "Apply Block Immediately" : "Schedule Block"}
            </Button>
          )}
        </DialogFooter>
      </form>
    </Dialog>
  );
}
