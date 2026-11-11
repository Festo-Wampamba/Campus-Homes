import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { RoomChangeReviewItem } from "@campushomes/shared";
import { RoomChangeReviewManager } from "./room-change-review-manager";

const mockApi = jest.fn();
jest.mock("../../lib/api", () => ({ ...jest.requireActual("../../lib/api"), api: (...args: unknown[]) => mockApi(...args) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const item: RoomChangeReviewItem = {
  id: "request-1", propertyId: "property-1", semesterId: "semester-1", propertyName: "Example Villas", landlordName: "Example Landlord",
  status: "visit_required", submittedAt: "2026-11-11T07:00:00Z", submissionNotes: null, physicalRoomChangesCount: 20, roomTypeChangesCount: 0,
  roomTypeChanges: [], physicalRoomChanges: Array.from({ length: 20 }, (_, i) => ({ id: `room-${i}`, action: "create", before: null,
    after: { roomCode: `A${String(i + 1).padStart(2, "0")}`, buildingName: null, floorLabel: null, capacity: 1 } })),
};
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); mockApi.mockReset(); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const click = async (text: string) => act(async () => { [...container.querySelectorAll("button")].find((button) => button.textContent?.includes(text))!.click(); });

it("shows all 20 room changes and an inspection action for Ops", async () => {
  await act(async () => root.render(<RoomChangeReviewManager initialItems={[item]} canScheduleVisit />));
  expect(container.querySelectorAll("li")).toHaveLength(20);
  expect(container.textContent).toContain("A20");
  expect(container.querySelector('a')?.getAttribute("href")).toBe("/ops/visits/schedule?propertyId=property-1");
});

it("keeps applied updates informational with no approve or reject controls", async () => {
  await act(async () => root.render(<RoomChangeReviewManager initialItems={[]} initialActivity={[{
    id: "notice-1", propertyId: "property-1", propertyName: "Example Villas", landlordName: "Example Landlord", message: "Room A01 renamed", createdAt: "2026-11-11T07:00:00Z",
    changes: [{ label: "Room code", before: "OLD", after: "NEW" }],
  }]} />));
  expect(container.textContent).toContain("Saved · no approval needed");
  expect(container.textContent).toContain("OLD");
  expect(container.textContent).not.toContain("Approve changes");
});

it("requires a correction reason and submits it through the visible form", async () => {
  await act(async () => root.render(<RoomChangeReviewManager initialItems={[item]} />));
  await click("Return for correction");
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(mockApi).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("at least 3");
  await act(async () => {
    const textarea = container.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "Correct the room capacity");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  mockApi.mockResolvedValue({});
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(mockApi).toHaveBeenCalledWith("/ops/room-change-requests/request-1/reject", { method: "POST", body: JSON.stringify({ reason: "Correct the room capacity" }) });
  expect(container.textContent).toContain("No room changes need approval");
});
