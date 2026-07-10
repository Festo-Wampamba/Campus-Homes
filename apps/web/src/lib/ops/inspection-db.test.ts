import { getDraft, getQueuedDrafts, putDraft, type InspectionDraft } from "./inspection-db";

function makeDraft(overrides: Partial<InspectionDraft> = {}): InspectionDraft {
  return {
    visitId: "visit-1",
    clientIdempotencyKey: "key-1",
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
    completedAt: null,
    result: null,
    failureReason: "",
    syncStatus: "draft",
    ...overrides,
  };
}

describe("inspection-db", () => {
  it("returns undefined for a visit with no saved draft", async () => {
    const draft = await getDraft("missing-visit");
    expect(draft).toBeUndefined();
  });

  it("round-trips a saved draft", async () => {
    const saved = makeDraft();
    await putDraft(saved);
    const loaded = await getDraft("visit-1");
    expect(loaded).toEqual(saved);
  });

  it("returns only queued and failed drafts from getQueuedDrafts", async () => {
    await putDraft(makeDraft({ visitId: "visit-draft", syncStatus: "draft" }));
    await putDraft(makeDraft({ visitId: "visit-queued", syncStatus: "queued" }));
    await putDraft(makeDraft({ visitId: "visit-failed", syncStatus: "failed" }));
    await putDraft(makeDraft({ visitId: "visit-synced", syncStatus: "synced" }));

    const queued = await getQueuedDrafts();
    expect(queued.map((d) => d.visitId).sort()).toEqual(["visit-failed", "visit-queued"]);
  });
});
