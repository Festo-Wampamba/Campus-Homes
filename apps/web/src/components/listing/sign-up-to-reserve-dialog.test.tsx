import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { SignUpToReserveDialog } from "./sign-up-to-reserve-dialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom's <dialog> has no working showModal/close.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  this.removeAttribute("open");
};

const NEXT = "/listings/abc?room=single&intent=reserve";
let container: HTMLDivElement;
let root: Root;
const onOpenChange = jest.fn();

beforeEach(() => {
  onOpenChange.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<SignUpToReserveDialog open onOpenChange={onOpenChange} next={NEXT} />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const link = (text: string) => [...container.querySelectorAll("a")].find((a) => a.textContent === text)!;

describe("SignUpToReserveDialog", () => {
  it("sends Sign up to the register screen and back to the room", () => {
    const url = new URL(link("Sign up").href, "http://localhost");
    expect([url.searchParams.get("screen"), url.searchParams.get("next")]).toEqual(["register", NEXT]);
  });

  it("offers sign-in for existing accounts, returning to the room", () => {
    const url = new URL(link("Sign in").href, "http://localhost");
    expect([url.searchParams.get("screen"), url.searchParams.get("next")]).toEqual([null, NEXT]);
  });

  it("closes on Cancel", () => {
    act(() => [...container.querySelectorAll("button")].find((b) => b.textContent === "Cancel")!.click());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
