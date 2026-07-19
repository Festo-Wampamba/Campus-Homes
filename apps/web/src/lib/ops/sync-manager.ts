import type { SyncVisitInput } from "@campushomes/shared";

import { api, ApiError } from "@/lib/api";
import { uploadToCloudinary, type CloudinarySignature } from "@/lib/cloudinary";
import { getQueuedDrafts, putDraft, type InspectionDraft } from "./inspection-db";

/** Uploads captured photos one at a time, persisting progress after each —
 * a network drop mid-batch loses at most the file in flight, not everything
 * captured so far. Cloudinary needs real connectivity, which is exactly why
 * this waits until sync time instead of uploading at capture time (offline
 * in the field is the whole point of Inspection Mode). */
async function uploadPendingPhotos(draft: InspectionDraft): Promise<InspectionDraft> {
  let current = draft;
  while (current.photos.length > 0) {
    const [file, ...rest] = current.photos;
    const sig = await api<CloudinarySignature>("/uploads/sign", { method: "POST" });
    const { publicId } = await uploadToCloudinary(file, sig);
    current = {
      ...current,
      photos: rest,
      photoStorageKeys: [...current.photoStorageKeys, publicId],
    };
    await putDraft(current);
  }
  return current;
}

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
    photoStorageKeys: draft.photoStorageKeys,
  };
}

async function syncOne(draft: InspectionDraft): Promise<void> {
  // Reassigned as photo-upload progress persists, so the catch block below
  // always saves the latest state — not the pre-upload snapshot, which would
  // otherwise silently erase any photos that did finish uploading before a
  // later one (or the sync POST itself) failed.
  let current: InspectionDraft = { ...draft, syncStatus: "syncing" };
  await putDraft(current);
  try {
    current = await uploadPendingPhotos(current);
    await api("/ops/visits/sync", {
      method: "POST",
      body: JSON.stringify(toSyncPayload(current)),
    });
    await putDraft({ ...current, syncStatus: "synced" });
  } catch (err) {
    // Only network-shaped failures are worth retrying: fetch itself throws a
    // TypeError on a network failure, and a 5xx means the server may recover.
    // Everything else (local validation throws, unexpected errors, 4xx) is
    // terminal — retrying it forever would just resend the same bad request.
    const isRetryable = err instanceof TypeError || (err instanceof ApiError && err.status >= 500);
    await putDraft({ ...current, syncStatus: isRetryable ? "queued" : "failed" });
  }
}

/** Drains every queued or orphaned-mid-sync draft, one at a time. "failed"
 * drafts are terminal — they need an explicit manual retry (out of scope
 * here), not the automatic loop. "syncing" drafts are included: that status
 * only ever means a prior attempt was interrupted (tab closed/navigated away
 * between putDraft(..., "syncing") and the fetch resolving) — getQueuedDrafts
 * returns them for exactly this reason, and resending is safe since the sync
 * POST is idempotent on clientIdempotencyKey. Safe to call concurrently with
 * itself — each call re-reads the queue fresh. */
export async function syncQueuedDrafts(): Promise<void> {
  const drafts = await getQueuedDrafts();
  for (const draft of drafts) {
    if (draft.syncStatus === "queued" || draft.syncStatus === "syncing") {
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
