"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
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
import type { RoomType, RoomUnit } from "@/lib/room-management";

interface BulkRoomGeneratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  roomTypes: RoomType[];
  existingRooms: RoomUnit[];
  onGenerated: (newRooms: RoomUnit[]) => void;
}

export function BulkRoomGeneratorDialog({
  open,
  onOpenChange,
  propertyId,
  roomTypes,
  existingRooms,
  onGenerated,
}: BulkRoomGeneratorDialogProps) {
  const [mode, setMode] = useState<"range" | "custom">("range");
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string>(
    roomTypes[0]?.id ?? "",
  );
  const [buildingName, setBuildingName] = useState("");
  const [floorLabel, setFloorLabel] = useState("");

  // Range mode fields
  const [prefix, setPrefix] = useState("Room ");
  const [startNum, setStartNum] = useState("101");
  const [endNum, setEndNum] = useState("110");
  const [zeroPad, setZeroPad] = useState(false);

  // Custom mode fields
  const [customInput, setCustomInput] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingCodesSet = useMemo(() => {
    return new Set(
      existingRooms
        .filter((r) => !buildingName || (r.buildingName ?? "").toLowerCase() === buildingName.trim().toLowerCase())
        .map((r) => r.roomCode.trim().toLowerCase()),
    );
  }, [existingRooms, buildingName]);

  const previewCodes = useMemo(() => {
    const list: string[] = [];

    if (mode === "range") {
      const s = parseInt(startNum, 10);
      const e = parseInt(endNum, 10);
      if (!isNaN(s) && !isNaN(e) && e >= s) {
        const count = Math.min(e - s + 1, 200);
        const padLen = zeroPad ? Math.max(startNum.length, endNum.length) : 0;

        for (let i = 0; i < count; i++) {
          const numStr = padLen ? String(s + i).padStart(padLen, "0") : String(s + i);
          list.push(`${prefix}${numStr}`);
        }
      }
    } else {
      const split = customInput
        .split(/[,\n]/)
        .map((c) => c.trim())
        .filter(Boolean);
      // Deduplicate case-insensitively within input
      const seen = new Set<string>();
      for (const item of split) {
        const lower = item.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          list.push(item);
        }
        if (list.length >= 200) break;
      }
    }

    return list;
  }, [mode, prefix, startNum, endNum, zeroPad, customInput]);

  const conflicts = useMemo(() => {
    return previewCodes.filter((c) => existingCodesSet.has(c.toLowerCase()));
  }, [previewCodes, existingCodesSet]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRoomTypeId) {
      setError("Please select a Room Type specification for these rooms.");
      return;
    }
    if (previewCodes.length === 0) {
      setError("Please generate or enter at least one valid room code.");
      return;
    }
    if (previewCodes.length > 200) {
      setError("Maximum 200 rooms can be generated in one batch.");
      return;
    }
    if (conflicts.length > 0) {
      setError(
        `There are ${conflicts.length} conflicting room codes already in this building. Please modify the codes.`,
      );
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        roomTypeId: selectedRoomTypeId,
        buildingName: buildingName.trim() || null,
        floorLabel: floorLabel.trim() || null,
        roomCodes: previewCodes,
        idempotencyKey: `bulk-${propertyId}-${Date.now()}`,
      };

      const result = await api<RoomUnit[]>(
        `/room-management/properties/${propertyId}/rooms/bulk`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );

      onGenerated(result);
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to bulk generate rooms."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg">
      <form onSubmit={handleGenerate} className="flex flex-col h-full">
        <DialogHeader
          title="Bulk Generate Physical Rooms"
          description="Quickly generate sequential or custom room codes and assign them to a room type. Added rooms are staged into your draft change set."
          onClose={() => onOpenChange(false)}
        />

        <DialogBody className="space-y-5">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/20 bg-destructive-subtle p-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          {/* Mode switch */}
          <div className="flex rounded-lg border border-border p-1 bg-muted/40">
            <button
              type="button"
              onClick={() => setMode("range")}
              className={`flex-1 rounded-md py-2 text-xs font-semibold transition-colors ${
                mode === "range"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sequential Range (e.g. Room 101 to 120)
            </button>
            <button
              type="button"
              onClick={() => setMode("custom")}
              className={`flex-1 rounded-md py-2 text-xs font-semibold transition-colors ${
                mode === "custom"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Custom Codes (CSV or Newline)
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="bg-room-type">Room Type Specification</Label>
              <select
                id="bg-room-type"
                value={selectedRoomTypeId}
                onChange={(e) => setSelectedRoomTypeId(e.target.value)}
                required
                className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
              >
                {roomTypes.map((rt) => {
                  const ver = rt.pendingVersion ?? rt.currentVersion;
                  return (
                    <option key={rt.id} value={rt.id}>
                      {ver?.title ?? "Untitled"} ({ver?.capacity ?? 1} beds)
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <Label htmlFor="bg-building">Building / Block (optional)</Label>
              <Input
                id="bg-building"
                value={buildingName}
                onChange={(e) => setBuildingName(e.target.value)}
                placeholder="e.g. Block A, East Wing"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="bg-floor">Floor / Level (optional)</Label>
              <Input
                id="bg-floor"
                value={floorLabel}
                onChange={(e) => setFloorLabel(e.target.value)}
                placeholder="e.g. 1st Floor, Ground"
                className="mt-1.5"
              />
            </div>
          </div>

          {mode === "range" ? (
            <div className="rounded-lg border border-border p-4 bg-muted/20 space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="bg-prefix">Code Prefix</Label>
                  <Input
                    id="bg-prefix"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    placeholder="e.g. Room , A-"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="bg-start">Start Number</Label>
                  <Input
                    id="bg-start"
                    type="number"
                    value={startNum}
                    onChange={(e) => setStartNum(e.target.value)}
                    className="mt-1.5 font-mono"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="bg-end">End Number</Label>
                  <Input
                    id="bg-end"
                    type="number"
                    value={endNum}
                    onChange={(e) => setEndNum(e.target.value)}
                    className="mt-1.5 font-mono"
                    required
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={zeroPad}
                  onChange={(e) => setZeroPad(e.target.checked)}
                  className="rounded border-input text-teal-600 focus:ring-teal-600 size-4"
                />
                <span>Zero-pad room numbers (e.g. 01, 02 instead of 1, 2)</span>
              </label>
            </div>
          ) : (
            <div>
              <Label htmlFor="bg-custom">Room Codes (Comma or Newline separated)</Label>
              <Textarea
                id="bg-custom"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="BH01, BH02, F7, Block B-104&#10;Room 201&#10;Room 202"
                className="mt-1.5 min-h-28 font-mono text-xs"
              />
            </div>
          )}

          {/* Live Conflict & Code Preview */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Generated Preview ({previewCodes.length} rooms)
              </span>
              {conflicts.length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive">
                  <AlertCircle className="size-3.5" />
                  {conflicts.length} conflict(s) detected
                </span>
              )}
            </div>

            <div className="max-h-40 overflow-y-auto rounded-lg border border-border p-3 bg-muted/40">
              {previewCodes.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-4">
                  Enter range numbers or custom codes to preview.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {previewCodes.map((code) => {
                    const isConflict = existingCodesSet.has(code.toLowerCase());
                    return (
                      <span
                        key={code}
                        className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-mono font-medium ${
                          isConflict
                            ? "bg-destructive/15 text-destructive border border-destructive/30"
                            : "bg-card border border-border text-foreground"
                        }`}
                      >
                        {code}
                        {isConflict && <AlertCircle className="size-3" />}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
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
          <Button
            type="submit"
            disabled={
              submitting ||
              previewCodes.length === 0 ||
              conflicts.length > 0 ||
              previewCodes.length > 200
            }
          >
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Generate {previewCodes.length} Room{previewCodes.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
