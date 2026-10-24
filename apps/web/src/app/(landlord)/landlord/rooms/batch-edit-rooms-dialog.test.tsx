import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { RoomUnit } from "@/lib/room-management";
import { BatchEditRoomsDialog } from "./batch-edit-rooms-dialog";

const mockApi = jest.fn();
jest.mock("../../../../lib/api", () => ({
  ...jest.requireActual("../../../../lib/api"),
  api: (...args: unknown[]) => mockApi(...args),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  this.removeAttribute("open");
};

const room = (id: string, roomCode: string) =>
  ({ id, roomCode, roomTypeId: "type-1", roomTypeTitle: "Double Room", buildingName: null, floorLabel: null }) as unknown as RoomUnit;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mockApi.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("numbers the selected rooms from a prefix and saves them together", async () => {
  await act(async () =>
    root.render(<BatchEditRoomsDialog propertyId="p1" rooms={[room("r1", "Double 1"), room("r2", "Double 1")]} onClose={() => {}} onUpdated={() => {}} />),
  );
  const prefix = container.querySelector<HTMLInputElement>('input[placeholder^="e.g. D"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(prefix, "D");
    prefix.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Apply numbering")!.click());
  mockApi.mockResolvedValueOnce([]);

  await act(async () => container.querySelector("form")!.requestSubmit());

  const body = JSON.parse((mockApi.mock.calls[0]![1] as { body: string }).body) as { rooms: { roomCode: string }[] };
  expect(body.rooms.map((r) => r.roomCode)).toEqual(["D1", "D2"]);
});
