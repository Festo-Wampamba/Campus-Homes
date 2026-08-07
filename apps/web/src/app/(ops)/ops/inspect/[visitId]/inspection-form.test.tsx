import { IDBFactory } from "fake-indexeddb";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { putDraft, type InspectionDraft } from "@/lib/ops/inspection-db";

import { InspectionForm } from "./inspection-form";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function waitFor(condition: () => boolean, attempts = 20): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    if (condition()) return;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
  throw new Error("waitFor: condition never became true");
}

function failedDraft(visitId: string): InspectionDraft {
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
    syncStatus: "failed",
    photos: [],
    photoStorageKeys: [],
  };
}

describe("InspectionForm", () => {
  let container: HTMLDivElement;
  let root: Root;
  const originalFetch = global.fetch;
  const originalGeolocation = navigator.geolocation;

  beforeEach(() => {
    global.indexedDB = new IDBFactory();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    global.fetch = originalFetch;
    Object.defineProperty(navigator, "geolocation", { value: originalGeolocation, configurable: true });
  });

  it("does not discard a checklist edit made while a GPS scan is in flight", async () => {
    let resolvePosition: ((pos: GeolocationPosition) => void) | undefined;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: (pos: GeolocationPosition) => void) => {
          resolvePosition = success;
        },
      },
    });

    act(() => {
      root.render(<InspectionForm visitId="visit-gps-race" />);
    });
    await waitFor(() => container.textContent !== "Loading…");

    act(() => {
      container.querySelector<HTMLButtonElement>('button[type="button"]')?.click();
    });
    expect(resolvePosition).toBeDefined();

    // Concurrent edit lands while the GPS scan is still "in flight".
    const notes = container.querySelector<HTMLTextAreaElement>("textarea");
    act(() => {
      notes?.dispatchEvent(new Event("input", { bubbles: true }));
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(notes, "edited during scan");
      notes?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(notes?.value).toBe("edited during scan");

    act(() => {
      resolvePosition?.({ coords: { latitude: 1.23, longitude: 4.56 } } as GeolocationPosition);
    });

    expect(notes?.value).toBe("edited during scan");
    expect(container.textContent).toContain("1.230000, 4.560000");
  });

  it("retries a failed draft when 'Try again' is clicked", async () => {
    await putDraft(failedDraft("visit-retry"));
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "visit-retry" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    act(() => {
      root.render(<InspectionForm visitId="visit-retry" />);
    });
    await waitFor(() => container.textContent !== "Loading…");

    const tryAgain = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Try again",
    );
    expect(tryAgain).toBeDefined();

    act(() => {
      tryAgain?.click();
    });
    await waitFor(() => fetchMock.mock.calls.length > 0);
    expect(container.textContent).not.toContain("Couldn't submit this checklist");
  });
});
