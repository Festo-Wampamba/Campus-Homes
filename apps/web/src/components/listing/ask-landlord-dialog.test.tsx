import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { AskLandlordDialog } from "./ask-landlord-dialog";

const mockApi = jest.fn();
jest.mock("../../lib/api", () => ({
  ...jest.requireActual("../../lib/api"),
  api: (...args: unknown[]) => mockApi(...args),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom's <dialog> has no working showModal/close.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  this.removeAttribute("open");
};

let container: HTMLDivElement;
let root: Root;

function button(text: string) {
  return [...document.querySelectorAll("button")].find((b) => b.textContent === text)!;
}

async function sendMessage(text: string) {
  const textarea = document.querySelector("textarea")!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(textarea, text);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => button("Send").click());
}

async function render(viewing: boolean) {
  await act(async () =>
    root.render(<AskLandlordDialog listingId="listing-1" propertyName="Kikoni Rise" viewing={viewing} />),
  );
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mockApi.mockResolvedValue({});
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  mockApi.mockReset();
});

describe("AskLandlordDialog", () => {
  it("sends a viewing request from the Request a viewing button", async () => {
    await render(true);
    await act(async () => button("Request a viewing").click());

    await sendMessage("Saturday afternoon?");

    expect(JSON.parse(mockApi.mock.calls[0][1].body).subject).toBe("Viewing request: Kikoni Rise");
  });

  it("sends a plain question from the Ask about this place button", async () => {
    await render(false);
    await act(async () => button("Ask about this place").click());

    await sendMessage("Is water included?");

    expect(JSON.parse(mockApi.mock.calls[0][1].body).subject).toBe("Question: Kikoni Rise");
  });
});
