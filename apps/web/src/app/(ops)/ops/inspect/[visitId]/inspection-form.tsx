"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  };
}

const numberFieldClass =
  "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs sm:h-10";

export function InspectionForm({ visitId }: { visitId: string }) {
  const [draft, setDraft] = useState<InspectionDraft | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (cancelled) return;
            setDraft((prev) =>
              prev
                ? { ...prev, visitGpsLat: pos.coords.latitude, visitGpsLon: pos.coords.longitude }
                : prev,
            );
          },
          () => {
            // Permission denied or unavailable — the manual fields below cover it.
          },
        );
      }
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

  const allAnswered = VERIFICATION_CHECKLIST_COMPONENTS.every(
    (c) => draft.checklist[c].passed !== null,
  );
  const canSubmit = allAnswered && draft.result !== null && draft.visitGpsLat !== null;

  async function submit() {
    const completed: InspectionDraft = {
      ...currentDraft,
      completedAt: new Date().toISOString(),
      syncStatus: "queued",
    };
    await putDraft(completed);
    setDraft(completed);
    void syncQueuedDrafts();
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
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
      {draft.syncStatus === "queued" && (
        <p role="status" className="text-sm text-warning">
          Saved on this device — will sync automatically when back online.
        </p>
      )}
    </div>
  );
}
