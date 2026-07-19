import type { VerificationChecklistComponent } from "@campushomes/shared";

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
  photos: File[];
  photoStorageKeys: string[];
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
    req.onsuccess = () => resolve(req.result as InspectionDraft | undefined);
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
