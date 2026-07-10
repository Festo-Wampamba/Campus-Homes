import type { SyncVisitInput } from "@campushomes/shared";

import { api, ApiError } from "@/lib/api";
import { getQueuedDrafts, putDraft, type InspectionDraft } from "./inspection-db";

function toSyncPayload(draft: InspectionDraft): SyncVisitInput {
  if (draft.visitGpsLat === null || draft.visitGpsLon === null) {
    throw new Error("Cannot sync a draft with no GPS captured");
  }
  if (!draft.completedAt || !draft.result) {
    throw new Error("Cannot sync an incomplete draft");
  }
  return {
    clientIdempotencyKey: draft.clientIdempotencyKey,
    visitId: draft.visitId,
    checklist: draft.checklist as SyncVisitInput["checklist"],
    visitGpsLat: draft.visitGpsLat,
    visitGpsLon: draft.visitGpsLon,
    startedAt: draft.startedAt,
    completedAt: draft.completedAt,
    result: draft.result,
    failureReason: draft.failureReason || undefined,
  };
}

async function syncOne(draft: InspectionDraft): Promise<void> {
  await putDraft({ ...draft, syncStatus: "syncing" });
  try {
    await api("/ops/visits/sync", {
      method: "POST",
      body: JSON.stringify(toSyncPayload(draft)),
    });
    await putDraft({ ...draft, syncStatus: "synced" });
  } catch (err) {
    const isClientError = err instanceof ApiError && err.status >= 400 && err.status < 500;
    await putDraft({ ...draft, syncStatus: isClientError ? "failed" : "queued" });
  }
}

/** Drains every queued/failed draft, one at a time. Safe to call
 * concurrently with itself — each call re-reads the queue fresh. */
export async function syncQueuedDrafts(): Promise<void> {
  const drafts = await getQueuedDrafts();
  for (const draft of drafts) {
    await syncOne(draft);
  }
}

/** In-page sync trigger (no Service Worker — that's Phase 7). Drains on
 * 'online', on a 30s fallback interval, and once immediately. Returns a
 * cleanup function. */
export function startSyncManager(): () => void {
  const onOnline = () => {
    void syncQueuedDrafts();
  };
  window.addEventListener("online", onOnline);
  const interval = setInterval(() => void syncQueuedDrafts(), 30_000);
  void syncQueuedDrafts();
  return () => {
    window.removeEventListener("online", onOnline);
    clearInterval(interval);
  };
}
