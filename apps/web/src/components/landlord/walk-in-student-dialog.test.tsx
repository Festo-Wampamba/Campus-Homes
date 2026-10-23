import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { WalkInStudentButton } from "./walk-in-student-dialog";

const mockApi = jest.fn();
jest.mock("../../lib/api", () => ({
  ...jest.requireActual("../../lib/api"),
  api: (...args: unknown[]) => mockApi(...args),
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  this.removeAttribute("open");
};

const BED = {
  id: "5f0c2a9e-1111-4222-8333-444455556666",
  propertyName: "Mirembe Student Courts",
  roomLabel: "Single 3",
  bedLabel: "Bed 1",
  roomCategory: "single",
  selfContained: false,
};

let container: HTMLDivElement;
let root: Root;

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

const button = (text: string) => Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes(text))!;

async function open(beds = [BED]) {
  await act(async () => root.render(<WalkInStudentButton beds={beds} />));
  await act(async () => button("Add walk-in student").click());
}

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

it("books the chosen bed for the walk-in student", async () => {
  await open();
  const [name, phone] = Array.from(container.querySelectorAll<HTMLInputElement>("input:not([type=radio]):not([type=number])"));
  await act(async () => {
    type(name!, "Amina Nakato");
    type(phone!, "+256771234567");
  });
  mockApi.mockResolvedValueOnce({ studentCreated: true, status: "booked" });

  await act(async () => container.querySelector("form")!.requestSubmit());

  expect(mockApi).toHaveBeenCalledWith("/reservations/walk-in", expect.objectContaining({
    body: JSON.stringify({ bedId: BED.id, name: "Amina Nakato", phone: "+256771234567", university: "MUK", movedIn: false }),
  }));
});

it("explains there is nothing to book when no bed is free", async () => {
  await open([]);

  expect(container.textContent).toContain("No free beds right now");
});
