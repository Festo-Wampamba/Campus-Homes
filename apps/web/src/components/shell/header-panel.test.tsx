import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HeaderPanel } from "./header-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
let compact: boolean;
let notify: () => void;
const onClose = jest.fn();
beforeEach(() => {
  compact = false;
  onClose.mockClear();
  window.matchMedia = jest.fn().mockImplementation(() => ({
    get matches() { return compact; },
    addEventListener: (_event: string, listener: () => void) => { notify = listener; },
    removeEventListener: jest.fn(),
  }));
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
const render = () => act(async () => root.render(<StrictMode><HeaderPanel label="Account" onClose={onClose}><a href="/profile">Profile settings</a></HeaderPanel></StrictMode>));
it("uses an accessible nonmodal panel on a large screen", async () => {
  await render();
  expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Account");
  expect(container.querySelector("dialog")).toBeNull();
});
it("keeps the compact modal open through strict mounting and adapts after resize", async () => {
  compact = true;
  await render();
  expect(container.querySelector("dialog")?.open).toBe(true);
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => { compact = false; notify(); });
  expect(container.querySelector("dialog")).toBeNull();
  expect(container.querySelector('[role="dialog"] a')?.textContent).toBe("Profile settings");
});
it("propagates a native modal close to its owner", async () => {
  compact = true;
  await render();
  await act(async () => container.querySelector("dialog")!.close());
  expect(onClose).toHaveBeenCalledTimes(1);
});
