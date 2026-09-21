import type { PhotoCategory, VerificationChecklistComponent, VisitPhoto } from "@campushomes/shared";

export type SyncStatus = "draft" | "queued" | "syncing" | "synced" | "failed";

export interface InspectionDraft {
  visitId: string;
  clientIdempotencyKey: string;
  checklist: Record<VerificationChecklistComponent, { passed: boolean | null; notes: string }>;
  visitGpsLat: number | null;
  visitGpsLon: number | null;
  startedAt: string;
  completedAt: string | null;
  result: "passed" | "failed" | null;
  failureReason: string;
  syncStatus: SyncStatus;
  // Captured offline (IndexedDB stores File objects natively via structured
  // clone) but not yet uploaded — sync-manager.ts uploads these to Cloudinary
  // once the device is back online, moving each into photoStorageKeys so a
  // retried sync never re-uploads an already-uploaded photo.
  photos: PendingPhoto[];
  photoStorageKeys: VisitPhoto[];
}

/** A captured-but-not-yet-uploaded photo and the part of the property it shows.
 * The category is chosen at capture time, on site, and rides along through the
 * upload so it survives into listing_photos. */
export interface PendingPhoto {
  file: File;
  category: PhotoCategory;
  // Free-text room type when category is 'custom'.
  label?: string;
  // Whether the room shown is self-contained — only set for bedroom categories.
  selfContained?: boolean;
}

/** Drafts written before photo categories existed hold bare Files and bare
 * storage keys. A half-finished inspection on an inspector's device must not
 * break (or silently lose its photos) just because the app updated under it, so
 * both are read forward into the current shape as 'other'. */
function normalizeDraft(draft: InspectionDraft | undefined): InspectionDraft | undefined {
  if (!draft) return draft;
  return {
    ...draft,
    photos: (draft.photos ?? []).map((p) =>
      p instanceof File ? { file: p, category: "other" as const } : p,
    ),
    photoStorageKeys: (draft.photoStorageKeys ?? []).map((k) =>
      typeof k === "string" ? { storageKey: k, category: "other" as const } : k,
    ),
  };
}

const DB_NAME = "campushomes-ops";
const DB_VERSION = 1;
const STORE_NAME = "inspection-drafts";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: "visitId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getDraft(visitId: string): Promise<InspectionDraft | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(visitId);
    req.onsuccess = () => resolve(normalizeDraft(req.result as InspectionDraft | undefined));
    req.onerror = () => reject(req.error);
  });
}

export async function putDraft(draft: InspectionDraft): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(draft);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueuedDrafts(): Promise<InspectionDraft[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const all = req.result as InspectionDraft[];
      // "syncing" is included so a draft orphaned mid-sync (the tab was
      // closed/navigated away between putDraft(..., "syncing") and the
      // fetch resolving — getQueuedDrafts only ever ran "queued"/"failed"
      // before, so a "syncing" draft was invisible to every future retry
      // and stuck forever) gets picked back up. Safe to resend: the sync
      // POST is idempotent on clientIdempotencyKey.
      resolve(
        all.filter(
          (d) =>
            d.syncStatus === "queued" ||
            d.syncStatus === "failed" ||
            d.syncStatus === "syncing",
        ),
      );
    };
    req.onerror = () => reject(req.error);
  });
}
