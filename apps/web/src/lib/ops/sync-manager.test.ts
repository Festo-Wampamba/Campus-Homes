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
});
