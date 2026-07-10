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
    // Only network-shaped failures are worth retrying: fetch itself throws a
    // TypeError on a network failure, and a 5xx means the server may recover.
    // Everything else (local validation throws, unexpected errors, 4xx) is
    // terminal — retrying it forever would just resend the same bad request.
    const isRetryable = err instanceof TypeError || (err instanceof ApiError && err.status >= 500);
    await putDraft({ ...draft, syncStatus: isRetryable ? "queued" : "failed" });
  }
}

/** Drains every queued draft, one at a time. "failed" drafts are terminal —
 * they need an explicit manual retry (out of scope here), not the automatic
 * loop. Safe to call concurrently with itself — each call re-reads the queue
 * fresh. */
export async function syncQueuedDrafts(): Promise<void> {
  const drafts = await getQueuedDrafts();
  for (const draft of drafts) {
    if (draft.syncStatus === "queued") {
      await syncOne(draft);
    }
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
