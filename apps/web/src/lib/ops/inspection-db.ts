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
      resolve(all.filter((d) => d.syncStatus === "queued" || d.syncStatus === "failed"));
    };
    req.onerror = () => reject(req.error);
  });
}
