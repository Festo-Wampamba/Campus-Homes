"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { api, apiErrorMessage } from "@/lib/api";
import type { RoomUnit } from "@/lib/room-management";

const FIELD =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Edit several rooms at once (Festo, 2026-10-23): retype each code, or number
 * them from a prefix, and optionally move them all to one building or floor.
 * Staged as one draft for Ops review, like single edits. */
export function BatchEditRoomsDialog({
  propertyId,
  rooms,
  onClose,
  applyImmediately = false,
  onUpdated,
}: {
  propertyId: string;
  applyImmediately?: boolean;
  rooms: RoomUnit[];
  onClose: () => void;
  onUpdated: (rooms: RoomUnit[]) => void;
}) {
  const [codes, setCodes] = useState(() => new Map(rooms.map((room) => [room.id, room.roomCode])));
  const [prefix, setPrefix] = useState("");
  const [start, setStart] = useState("1");
  const [zeroPad, setZeroPad] = useState(false);
  const first = /^\d+$/.test(start) ? Number(start) : NaN;
  const validStart = Number.isSafeInteger(first) && first >= 0 && Number.isSafeInteger(first + rooms.length);
  const padWidth = zeroPad ? Math.max(2, start.length, String(first + rooms.length - 1).length) : 0;
  const numberedCode = (index: number) => `${prefix}${String(first + index).padStart(padWidth, "0")}`;
  const [building, setBuilding] = useState("");
  const [floor, setFloor] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function numberRooms() {
    if (!validStart) return;
    setCodes(new Map(rooms.map((room, index) => [room.id, numberedCode(index)])));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const updated = await api<RoomUnit[]>(`/room-management/properties/${propertyId}/rooms/batch-update`, {
        method: "POST",
        body: JSON.stringify({
          rooms: rooms.map((room) => ({
            roomId: room.id,
            roomCode: (codes.get(room.id) ?? room.roomCode).trim(),
            roomTypeId: room.roomTypeId,
            buildingName: building.trim() || room.buildingName || null,
            floorLabel: floor.trim() || room.floorLabel || null,
          })),
        }),
      });
      onUpdated(updated);
      onClose();
    } catch (caught) {
      setError(apiErrorMessage(caught, "Couldn't save these rooms. Nothing was changed."));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog aria-label={`Edit ${rooms.length} rooms`} open onOpenChange={(next) => { if (!next) onClose(); }} size="lg" dismissible={false} resizable>
      <form onSubmit={submit} className="contents">
        <DialogHeader
          title={`Edit ${rooms.length} ${rooms.length === 1 ? "room" : "rooms"}`}
          description={applyImmediately ? "Change each code below, or number them all at once. Your changes apply immediately." : "Change each code below, or number them all at once. Your edits are staged together and sent to Operations for approval."}
          onClose={onClose}
        />
        <DialogBody className="space-y-5">
          <fieldset className="rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-semibold">Number them automatically</legend>
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
              <label className="block text-sm">
                Code prefix
                <input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="e.g. D or Block A-" className={`mt-1 ${FIELD}`} />
              </label>
              <label className="block text-sm">
                Start at
                <Input type="number" min={0} step={1} value={start} onChange={(e) => setStart(e.target.value)} className={`mt-1 ${FIELD}`} />
              </label>
              <Button type="button" variant="secondary" onClick={numberRooms} disabled={!validStart}>Apply numbering</Button>
            </div>
            <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={zeroPad} onChange={(event) => setZeroPad(event.target.checked)} className="size-4 accent-primary" />
              Zero-pad room numbers (01, 02 instead of 1, 2)
            </label>
            <p className="mt-2 text-xs text-muted-foreground">
              {validStart ? `Fills the codes in list order: ${numberedCode(0)}, ${numberedCode(1)}…` : "Enter a whole number starting at 0 or above."}
            </p>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              Move all to building (optional)
              <input value={building} onChange={(e) => setBuilding(e.target.value)} placeholder="Leave blank to keep" className={`mt-1 ${FIELD}`} />
            </label>
            <label className="block text-sm">
              Move all to floor (optional)
              <input value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="Leave blank to keep" className={`mt-1 ${FIELD}`} />
            </label>
          </div>

          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr><th className="py-2 pr-3 font-semibold">Current code</th><th className="py-2 pr-3 font-semibold">Room type</th><th className="py-2 font-semibold">New code</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rooms.map((room) => (
                <tr key={room.id}>
                  <td className="py-2 pr-3 font-mono">{room.roomCode}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{room.roomTypeTitle}</td>
                  <td className="py-2">
                    <input
                      required
                      maxLength={100}
                      aria-label={`New code for ${room.roomCode}`}
                      value={codes.get(room.id) ?? ""}
                      onChange={(e) => setCodes((current) => new Map(current).set(room.id, e.target.value))}
                      className={`${FIELD} font-mono`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : `Save ${rooms.length} ${rooms.length === 1 ? "room" : "rooms"}`}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
