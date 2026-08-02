"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Camera, LocateFixed, X } from "lucide-react";
import {
  VERIFICATION_CHECKLIST_COMPONENTS,
  type VerificationChecklistComponent,
} from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusChip } from "@/components/status-chip";
import { getDraft, putDraft, type InspectionDraft } from "@/lib/ops/inspection-db";
import { syncQueuedDrafts } from "@/lib/ops/sync-manager";

function subscribeToConnectivity(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** Same useSyncExternalStore pattern as SyncStatusIndicator — avoids a
 * hydration mismatch (server can't know connectivity) and the
 * cascading-render lint rule a plain effect+setState would trip. */
function useOnline(): boolean {
  return useSyncExternalStore(subscribeToConnectivity, () => navigator.onLine, () => true);
}

/** Local blob preview for a not-yet-uploaded File — captured offline, so
 * there's no storage URL to point an <img> at yet. Revokes its object URL
 * on unmount so removing/replacing photos doesn't leak them. */
function PhotoThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url] = useState(() => URL.createObjectURL(file));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div className="group relative">
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, not a storage URL */}
      <img src={url} alt="" className="aspect-square w-full rounded-md object-cover" />
      <button
        type="button"
        aria-label="Remove photo"
        onClick={onRemove}
        className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
      >
        <X aria-hidden className="size-3" />
      </button>
    </div>
  );
}

const COMPONENT_LABEL: Record<VerificationChecklistComponent, string> = {
  location_gps: "Location & GPS",
  rooms_capacity: "Rooms & capacity",
  amenities: "Amenities",
  photos: "Photos match property",
  landlord_identity: "Landlord identity",
  safety: "Safety",
};

function emptyChecklist(): InspectionDraft["checklist"] {
  return Object.fromEntries(
    VERIFICATION_CHECKLIST_COMPONENTS.map((c) => [c, { passed: null, notes: "" }]),
  ) as InspectionDraft["checklist"];
}

function newDraft(visitId: string): InspectionDraft {
  return {
    visitId,
    clientIdempotencyKey: crypto.randomUUID(),
    checklist: emptyChecklist(),
    visitGpsLat: null,
    visitGpsLon: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    result: null,
    failureReason: "",
    syncStatus: "draft",
    photos: [],
    photoStorageKeys: [],
  };
}

const numberFieldClass =
  "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs sm:h-10";

export function InspectionForm({ visitId }: { visitId: string }) {
  const [draft, setDraft] = useState<InspectionDraft | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "scanning" | "error">("idle");
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const online = useOnline();

  useEffect(() => {
    let cancelled = false;
    getDraft(visitId).then(async (existing) => {
      if (cancelled) return;
      if (existing) {
        setDraft(existing);
        return;
      }
      const created = newDraft(visitId);
      await putDraft(created);
      if (!cancelled) setDraft(created);
    });
    return () => {
      cancelled = true;
    };
  }, [visitId]);

  const persist = useCallback((next: InspectionDraft) => {
    setDraft(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void putDraft(next);
    }, 300);
  }, []);

  if (!draft) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (draft.syncStatus === "synced") {
    return (
      <Card>
        <CardContent className="p-5">
          <StatusChip tone="success">Synced</StatusChip>
          <p className="mt-2 text-sm text-muted-foreground">
            This checklist has already been submitted and is waiting on lead approval.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Captured so the nested function declarations below type-check: TS resets
  // narrowing for hoisted `function` declarations, so referencing `draft`
  // directly inside them would still see `InspectionDraft | null`.
  const currentDraft = draft;

  function setComponent(
    component: VerificationChecklistComponent,
    patch: Partial<{ passed: boolean; notes: string }>,
  ) {
    persist({
      ...currentDraft,
      checklist: {
        ...currentDraft.checklist,
        [component]: { ...currentDraft.checklist[component], ...patch },
      },
    });
  }

  function addPhotos(files: File[]) {
    persist({ ...currentDraft, photos: [...currentDraft.photos, ...files] });
  }

  function removePhoto(index: number) {
    persist({ ...currentDraft, photos: currentDraft.photos.filter((_, i) => i !== index) });
  }

  const allAnswered = VERIFICATION_CHECKLIST_COMPONENTS.every(
    (c) => draft.checklist[c].passed !== null,
  );
  const canSubmit = allAnswered && draft.result !== null && draft.visitGpsLat !== null;

  async function submit() {
    // Cancel any pending debounced autosave first — otherwise it can fire
    // ~300ms later with a stale pre-submission draft and silently overwrite
    // this submission's completedAt/syncStatus back to unsynced "draft".
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const completed: InspectionDraft = {
      ...currentDraft,
      completedAt: new Date().toISOString(),
      syncStatus: "queued",
    };
    await putDraft(completed);
    setDraft(completed);
    await syncQueuedDrafts();
    const refreshed = await getDraft(visitId);
    if (refreshed) setDraft(refreshed);
  }

  async function retrySync() {
    setRetrying(true);
    await syncQueuedDrafts();
    const refreshed = await getDraft(visitId);
    if (refreshed) setDraft(refreshed);
    setRetrying(false);
  }

  function scanGps() {
    if (!navigator.geolocation) {
      setGpsStatus("error");
      setGpsError("Geolocation isn't available on this device.");
      return;
    }
    setGpsStatus("scanning");
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        persist({ ...currentDraft, visitGpsLat: pos.coords.latitude, visitGpsLon: pos.coords.longitude });
        setGpsStatus("idle");
      },
      (err) => {
        setGpsStatus("error");
        setGpsError(
          err.code === err.PERMISSION_DENIED
            ? "Location access was denied — allow it in your browser settings, or enter coordinates manually below."
            : "Couldn't get your location — try again, or enter coordinates manually below.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-foreground">Visit location</p>
            <Button type="button" size="sm" onClick={scanGps} disabled={gpsStatus === "scanning"} className="gap-1.5">
              <LocateFixed aria-hidden className="size-4" />
              {gpsStatus === "scanning" ? "Scanning…" : draft.visitGpsLat !== null ? "Rescan GPS" : "Scan GPS location"}
            </Button>
          </div>
          {draft.visitGpsLat !== null && draft.visitGpsLon !== null && gpsStatus !== "error" && (
            <p className="text-sm text-success">
              Captured: {draft.visitGpsLat.toFixed(6)}, {draft.visitGpsLon.toFixed(6)}
            </p>
          )}
          {gpsStatus === "error" && gpsError && <p className="text-sm text-destructive">{gpsError}</p>}
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-muted-foreground">Enter coordinates manually instead</summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="gps-lat">GPS latitude</Label>
                <input
                  id="gps-lat"
                  type="number"
                  step="any"
                  value={draft.visitGpsLat ?? ""}
                  onChange={(e) =>
                    persist({
                      ...draft,
                      visitGpsLat: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className={numberFieldClass}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gps-lon">GPS longitude</Label>
                <input
                  id="gps-lon"
                  type="number"
                  step="any"
                  value={draft.visitGpsLon ?? ""}
                  onChange={(e) =>
                    persist({
                      ...draft,
                      visitGpsLon: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className={numberFieldClass}
                />
              </div>
            </div>
          </details>
        </CardContent>
      </Card>

      {VERIFICATION_CHECKLIST_COMPONENTS.map((component) => {
        const entry = draft.checklist[component];
        return (
          <Card key={component}>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-foreground">{COMPONENT_LABEL[component]}</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={entry.passed === true ? "primary" : "secondary"}
                    onClick={() => setComponent(component, { passed: true })}
                  >
                    Pass
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={entry.passed === false ? "destructive" : "secondary"}
                    onClick={() => setComponent(component, { passed: false })}
                  >
                    Fail
                  </Button>
                </div>
              </div>
              <Textarea
                placeholder="Notes (optional)"
                value={entry.notes}
                onChange={(e) => setComponent(component, { notes: e.target.value })}
              />
              {component === "photos" && (
                <div className="space-y-2">
                  {draft.photos.length > 0 && (
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                      {draft.photos.map((file, i) => (
                        <PhotoThumb
                          key={`${file.name}-${file.lastModified}-${i}`}
                          file={file}
                          onRemove={() => removePhoto(i)}
                        />
                      ))}
                    </div>
                  )}
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-teal-700">
                    <Camera aria-hidden className="size-4" />
                    Take/add photos
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        e.target.value = "";
                        if (files.length > 0) addPhotos(files);
                      }}
                    />
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Uploaded automatically once this device is back online.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardContent className="space-y-3 p-5">
          <p className="font-semibold text-foreground">Overall result</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={draft.result === "passed" ? "primary" : "secondary"}
              onClick={() => persist({ ...draft, result: "passed" })}
            >
              Passed
            </Button>
            <Button
              type="button"
              variant={draft.result === "failed" ? "destructive" : "secondary"}
              onClick={() => persist({ ...draft, result: "failed" })}
            >
              Failed
            </Button>
          </div>
          {draft.result === "failed" && (
            <Textarea
              placeholder="Failure reason"
              value={draft.failureReason}
              onChange={(e) => persist({ ...draft, failureReason: e.target.value })}
            />
          )}
        </CardContent>
      </Card>

      <Button type="button" disabled={!canSubmit} onClick={submit} className="w-full">
        Submit checklist
      </Button>
      {draft.syncStatus === "queued" && !online && (
        <p role="status" className="text-sm text-warning">
          Saved on this device — will sync automatically when back online.
        </p>
      )}
      {draft.syncStatus === "queued" && online && (
        <div className="rounded-md border border-warning/30 bg-warning-subtle p-3">
          <p role="status" className="text-sm text-warning">
            Saved on this device — still waiting to sync.
          </p>
          <Button type="button" size="sm" variant="secondary" className="mt-2" disabled={retrying} onClick={retrySync}>
            {retrying ? "Retrying…" : "Retry sync now"}
          </Button>
        </div>
      )}
      {draft.syncStatus === "syncing" && (
        <p role="status" className="text-sm text-muted-foreground">
          Syncing…
        </p>
      )}
      {draft.syncStatus === "failed" && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
          <p role="status" className="text-sm text-destructive">
            Couldn&apos;t submit this checklist. Contact your lead if this keeps happening.
          </p>
          <Button type="button" size="sm" variant="secondary" className="mt-2" disabled={retrying} onClick={retrySync}>
            {retrying ? "Retrying…" : "Try again"}
          </Button>
        </div>
      )}
    </div>
  );
}
