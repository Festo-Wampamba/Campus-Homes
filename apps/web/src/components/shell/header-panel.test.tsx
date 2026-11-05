import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HeaderPanel } from "./header-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
let compact: boolean;
let notify: () => void;
let anchorRight: number;
const onClose = jest.fn();
beforeEach(() => {
  compact = false;
  anchorRight = 1000;
  jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ right: anchorRight, left: anchorRight - 44, top: 0, bottom: 44, width: 44, height: 44, x: anchorRight - 44, y: 0, toJSON: () => ({}) }));
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
afterEach(() => { act(() => root.unmount()); container.remove(); jest.restoreAllMocks(); });
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

it("uses a bounded modal when the anchor is too far left, and remeasures on resize", async () => {
  anchorRight = 200;
  await render();
  expect(container.querySelector("dialog")?.open).toBe(true);
  await act(async () => { anchorRight = 1000; window.dispatchEvent(new Event("resize")); });
  expect(container.querySelector("dialog")).toBeNull();
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
});
