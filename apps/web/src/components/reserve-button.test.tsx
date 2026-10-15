import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ReserveButton } from "./reserve-button";

const mockApi = jest.fn();
jest.mock("../lib/api", () => ({
  ...jest.requireActual("../lib/api"),
  api: (...args: unknown[]) => mockApi(...args),
}));
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: jest.fn() }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom's <dialog> has no working showModal/close.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  this.removeAttribute("open");
};

const RESERVED = {
  id: "5f0c2a9e-1111-4222-8333-444455556666",
  reservedAt: "2026-10-14T11:30:00.000Z",
  reservedExpiresAt: "2026-10-15T11:30:00.000Z",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mockApi.mockResolvedValue(RESERVED);
  await act(async () =>
    root.render(
      <ReserveButton
        bedId="bed-1"
        listingId="listing-1"
        needsProfile={false}
        propertyName="Kikoni Rise"
        roomLabel="Double"
      />,
    ),
  );
  await act(async () => [...container.querySelectorAll("button")].find((b) => b.textContent === "Reserve")!.click());
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  mockApi.mockReset();
  mockPush.mockReset();
});

describe("ReserveButton after a successful reservation", () => {
  it("names the hostel and room that were reserved", () => {
    expect(container.textContent).toContain("Kikoni Rise · Double");
  });

  it("says how long the room is held, from the API's times", () => {
    expect(container.textContent).toContain("for 24 hours");
  });

  it("says when the hold ends, in Kampala time", () => {
    expect(container.textContent).toContain("until Thu 15 Oct, 2:30 pm");
  });

  it("opens My reservations on the new reservation", async () => {
    await act(async () =>
      [...container.querySelectorAll("button")].find((b) => b.textContent === "View my reservations")!.click(),
    );

    expect(mockPush).toHaveBeenCalledWith(`/reservations?new=${RESERVED.id}`);
  });
});
