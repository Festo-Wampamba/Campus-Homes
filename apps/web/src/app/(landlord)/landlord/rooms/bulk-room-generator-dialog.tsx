"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Download, FileSpreadsheet, Loader2 } from "lucide-react";
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
import { planRoomImport, type ImportedRoomRow } from "@/lib/room-import";
import { resolveRoomTypeId, RoomTypePicker } from "./room-type-picker";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

interface BulkRoomGeneratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  /** Semester on screen: the template lists that semester's pending room type names. */
  semesterId: string;
  roomTypes: RoomType[];
  existingRooms: RoomUnit[];
  onGenerated: (newRooms: RoomUnit[]) => void;
}

// The three ways to add rooms read as real buttons: brand teal for the one in
// use, teal-outlined for the others.
const MODE_BUTTON =
  "rounded-md border px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const MODE_ON = "border-primary bg-primary text-primary-foreground shadow-xs";
const MODE_OFF = "border-primary/40 bg-card text-primary hover:bg-teal-50 dark:hover:bg-primary/10";

export function BulkRoomGeneratorDialog({
  open,
  onOpenChange,
  propertyId,
  semesterId,
  roomTypes,
  existingRooms,
  onGenerated,
}: BulkRoomGeneratorDialogProps) {
  const [mode, setMode] = useState<"range" | "custom" | "upload">("range");
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string>(
    roomTypes[0]?.id ?? "",
  );
  const roomTypeId = resolveRoomTypeId(roomTypes, selectedRoomTypeId);
  const [buildingName, setBuildingName] = useState("");
  const [floorLabel, setFloorLabel] = useState("");

  // Range mode fields
  const [prefix, setPrefix] = useState("Room ");
  const [startNum, setStartNum] = useState("101");
  const [endNum, setEndNum] = useState("110");
  const [zeroPad, setZeroPad] = useState(false);

  // Custom mode fields
  const [customInput, setCustomInput] = useState("");

  // Upload mode: rows parsed by the API from the landlord's spreadsheet.
  const [importRows, setImportRows] = useState<ImportedRoomRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importPlan = useMemo(
    () => (importRows ? planRoomImport(importRows, roomTypes, existingRooms) : null),
    [importRows, roomTypes, existingRooms],
  );

  async function readFile(file: File | undefined) {
    setImportRows(null);
    setError(null);
    if (!file) return;
    setFileName(file.name);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("The file is larger than 2 MB. Split it into smaller files.");
      return;
    }
    setParsing(true);
    try {
      const result = await api<{ rows: ImportedRoomRow[] }>("/room-management/rooms/import/parse", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      });
      setImportRows(result.rows);
      if (!result.rows.length) setError("The file has a header row but no rooms.");
    } catch (err) {
      setError(apiErrorMessage(err, "Could not read the file. Upload an Excel (.xlsx) or CSV file."));
    } finally {
      setParsing(false);
    }
  }

  /** Stages the valid rows through the same bulk endpoint as the other tabs,
   * one call per room type, building and floor. Rows with problems are skipped. */
  async function handleImport() {
    if (!importPlan?.batches.length) return;
    setSubmitting(true);
    setError(null);
    const added: RoomUnit[] = [];
    const stamp = Date.now();
    try {
      for (const [index, batch] of importPlan.batches.entries()) {
        added.push(
          ...(await api<RoomUnit[]>(`/room-management/properties/${propertyId}/rooms/bulk`, {
            method: "POST",
            body: JSON.stringify({ ...batch, idempotencyKey: `import-${propertyId}-${stamp}-${index}` }),
          })),
        );
      }
      onGenerated(added);
      onOpenChange(false);
    } catch (err) {
      if (added.length) onGenerated(added);
      setError(
        `${added.length ? `Added ${added.length} of ${importPlan.validCount} rooms. ` : ""}${apiErrorMessage(err, "Failed to add the rooms.")}`,
      );
      setImportRows(null);
    } finally {
      setSubmitting(false);
    }
  }

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
    if (mode === "upload") return handleImport();
    if (!roomTypeId) {
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
        roomTypeId,
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
      <form onSubmit={handleGenerate} className="flex min-h-0 flex-auto flex-col">
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
          <div role="group" aria-label="How to add rooms" className="grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setMode("range")}
              aria-pressed={mode === "range"}
              className={`${MODE_BUTTON} ${mode === "range" ? MODE_ON : MODE_OFF}`}
            >
              Sequential Range (e.g. Room 101 to 120)
            </button>
            <button
              type="button"
              onClick={() => setMode("custom")}
              aria-pressed={mode === "custom"}
              className={`${MODE_BUTTON} ${mode === "custom" ? MODE_ON : MODE_OFF}`}
            >
              Custom Codes (CSV or Newline)
            </button>
            <button
              type="button"
              onClick={() => setMode("upload")}
              aria-pressed={mode === "upload"}
              className={`${MODE_BUTTON} ${mode === "upload" ? MODE_ON : MODE_OFF}`}
            >
              Upload Spreadsheet (Excel or CSV)
            </button>
          </div>

          {mode === "upload" ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm">
                <p className="font-semibold text-foreground">Already keep your rooms in Excel?</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Upload it with a <strong>Room code</strong> column, and optionally Room type, Building and Floor.
                  Other columns (tenants, payments) are ignored. Start from the template for this property:
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`/api/v1/room-management/properties/${propertyId}/rooms/import/template?format=xlsx&semesterId=${semesterId}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-semibold hover:bg-muted"
                  >
                    <Download aria-hidden className="size-3.5" /> Excel template
                  </a>
                  <a
                    href={`/api/v1/room-management/properties/${propertyId}/rooms/import/template?format=csv&semesterId=${semesterId}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-semibold hover:bg-muted"
                  >
                    <Download aria-hidden className="size-3.5" /> CSV template
                  </a>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  The Excel template has a Room type dropdown with this property&apos;s room types (Excel, LibreOffice and Google Sheets).
                  A CSV file can&apos;t hold a dropdown, so type room types exactly as listed.
                </p>
              </div>

              <div>
                <Label htmlFor="bg-file">Spreadsheet (.xlsx or .csv, up to 2 MB, 500 rooms)</Label>
                <label
                  htmlFor="bg-file"
                  className="mt-1.5 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-input bg-card px-4 py-4 text-sm hover:bg-muted/40"
                >
                  {parsing ? <Loader2 aria-hidden className="size-5 animate-spin text-teal-700" /> : <FileSpreadsheet aria-hidden className="size-5 text-teal-700" />}
                  <span className="min-w-0 truncate">{parsing ? "Reading…" : fileName || "Choose a file"}</span>
                </label>
                <input
                  id="bg-file"
                  type="file"
                  accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  onChange={(e) => {
                    void readFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>

              {importPlan && importPlan.rows.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {importPlan.validCount} of {importPlan.rows.length} rooms ready
                    {importPlan.validCount < importPlan.rows.length && " · rows with a problem are skipped"}
                  </p>
                  <div className="max-h-64 overflow-auto rounded-lg border border-border">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-muted text-muted-foreground">
                        <tr>
                          <th className="px-2 py-1.5">Row</th>
                          <th className="px-2 py-1.5">Room code</th>
                          <th className="px-2 py-1.5">Room type</th>
                          <th className="px-2 py-1.5">Building</th>
                          <th className="px-2 py-1.5">Floor</th>
                          <th className="px-2 py-1.5">Check</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {importPlan.rows.map((row) => (
                          <tr key={row.rowNumber} className={row.error ? "bg-destructive/5" : undefined}>
                            <td className="px-2 py-1.5 text-muted-foreground">{row.rowNumber}</td>
                            <td className="px-2 py-1.5 font-mono">{row.roomCode}</td>
                            <td className="px-2 py-1.5">{row.roomType}</td>
                            <td className="px-2 py-1.5">{row.buildingName}</td>
                            <td className="px-2 py-1.5">{row.floorLabel}</td>
                            <td className={`px-2 py-1.5 font-semibold ${row.error ? "text-destructive" : "text-success"}`}>
                              {row.error ?? "OK"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
          <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="bg-room-type">Room Type Specification</Label>
              <RoomTypePicker id="bg-room-type" roomTypes={roomTypes} value={selectedRoomTypeId} onChange={setSelectedRoomTypeId} />
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
          {mode === "upload" ? (
            <Button type="submit" disabled={submitting || parsing || !importPlan?.validCount}>
              {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Add {importPlan?.validCount ?? 0} Room{importPlan?.validCount === 1 ? "" : "s"}
            </Button>
          ) : (
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
          )}
        </DialogFooter>
      </form>
    </Dialog>
  );
}
