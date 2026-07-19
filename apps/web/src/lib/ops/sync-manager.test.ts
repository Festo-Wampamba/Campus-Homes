import { IDBFactory } from "fake-indexeddb";

import { getDraft, putDraft, type InspectionDraft } from "./inspection-db";
import { syncQueuedDrafts } from "./sync-manager";

function queuedDraft(visitId: string): InspectionDraft {
  return {
    visitId,
    clientIdempotencyKey: `key-${visitId}`,
    checklist: {
      location_gps: { passed: true, notes: "" },
      rooms_capacity: { passed: true, notes: "" },
      amenities: { passed: true, notes: "" },
      photos: { passed: true, notes: "" },
      landlord_identity: { passed: true, notes: "" },
      safety: { passed: true, notes: "" },
    },
    visitGpsLat: 0.33,
    visitGpsLon: 32.57,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    result: "passed",
    failureReason: "",
    syncStatus: "queued",
    photos: [],
    photoStorageKeys: [],
  };
}

describe("syncQueuedDrafts", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Fresh, empty IndexedDB per test — inspection-db.ts never closes its
    // connections, so deleting the real database would hang forever waiting
    // for them to close. Swapping in a new factory instance sidesteps that
    // without touching inspection-db.ts.
    global.indexedDB = new IDBFactory();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("marks a successfully synced draft as synced", async () => {
    await putDraft(queuedDraft("visit-ok"));
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "visit-ok" }),
    }) as unknown as typeof fetch;

    await syncQueuedDrafts();

    const updated = await getDraft("visit-ok");
    expect(updated?.syncStatus).toBe("synced");
  });

  it("marks a draft rejected with a 4xx as failed, not retried", async () => {
    await putDraft(queuedDraft("visit-bad"));
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: "bad request" }),
    }) as unknown as typeof fetch;

    await syncQueuedDrafts();

    const updated = await getDraft("visit-bad");
    expect(updated?.syncStatus).toBe("failed");
  });

  it("leaves a draft queued for retry after a network error", async () => {
    await putDraft(queuedDraft("visit-offline"));
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Network request failed"));

    await syncQueuedDrafts();

    const updated = await getDraft("visit-offline");
    expect(updated?.syncStatus).toBe("queued");
  });

  it("marks a draft with no GPS captured as failed, not retried forever", async () => {
    await putDraft({ ...queuedDraft("visit-no-gps"), visitGpsLat: null, visitGpsLon: null });
    global.fetch = jest.fn();

    await syncQueuedDrafts();

    const updated = await getDraft("visit-no-gps");
    expect(updated?.syncStatus).toBe("failed");
  });

  it("does not resend a draft that is already marked failed", async () => {
    await putDraft({ ...queuedDraft("visit-already-failed"), syncStatus: "failed" });
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await syncQueuedDrafts();

    expect(fetchMock.mock.calls.length).toBe(0);
  });

  it("retries a draft orphaned mid-sync (interrupted before a prior attempt could finish)", async () => {
    await putDraft({ ...queuedDraft("visit-orphaned"), syncStatus: "syncing" });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "visit-orphaned" }),
    }) as unknown as typeof fetch;

    await syncQueuedDrafts();

    const updated = await getDraft("visit-orphaned");
    expect(updated?.syncStatus).toBe("synced");
  });

  it("uploads pending photos to Cloudinary before syncing, and stages the resulting key", async () => {
    const photo = new File(["fake-bytes"], "room.jpg", { type: "image/jpeg" });
    await putDraft({ ...queuedDraft("visit-with-photo"), photos: [photo] });

    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes("/uploads/sign")) {
        return {
          ok: true,
          json: async () => ({
            cloudName: "demo",
            apiKey: "key",
            timestamp: 1,
            folder: "uploads/x",
            signature: "sig",
          }),
        };
      }
      if (url.includes("cloudinary.com")) {
        return { ok: true, json: async () => ({ public_id: "uploaded-photo-key" }) };
      }
      if (url.includes("/ops/visits/sync")) {
        return { ok: true, json: async () => ({ id: "visit-with-photo" }) };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await syncQueuedDrafts();

    const updated = await getDraft("visit-with-photo");
    expect(updated?.syncStatus).toBe("synced");
    expect(updated?.photos).toEqual([]);
    expect(updated?.photoStorageKeys).toEqual(["uploaded-photo-key"]);

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const syncCall = calls.find(([url]) => url.includes("/ops/visits/sync"));
    const body = JSON.parse(syncCall?.[1]?.body as string);
    expect(body.photoStorageKeys).toEqual(["uploaded-photo-key"]);
  });

  it("leaves already-uploaded photos staged when the sync POST itself fails", async () => {
    const photo = new File(["fake-bytes"], "room.jpg", { type: "image/jpeg" });
    await putDraft({ ...queuedDraft("visit-photo-sync-fails"), photos: [photo] });

    global.fetch = jest.fn(async (url: string) => {
      if (url.includes("/uploads/sign")) {
        return {
          ok: true,
          json: async () => ({
            cloudName: "demo",
            apiKey: "key",
            timestamp: 1,
            folder: "uploads/x",
            signature: "sig",
          }),
        };
      }
      if (url.includes("cloudinary.com")) {
        return { ok: true, json: async () => ({ public_id: "uploaded-photo-key" }) };
      }
      if (url.includes("/ops/visits/sync")) {
        return { ok: false, status: 500, json: async () => ({ message: "server error" }) };
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await syncQueuedDrafts();

    const updated = await getDraft("visit-photo-sync-fails");
    // Retryable (5xx) — stays queued, but the photo upload isn't repeated
    // next attempt since it already moved into photoStorageKeys.
    expect(updated?.syncStatus).toBe("queued");
    expect(updated?.photos).toEqual([]);
    expect(updated?.photoStorageKeys).toEqual(["uploaded-photo-key"]);
  });
});
