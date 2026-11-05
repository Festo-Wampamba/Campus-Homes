import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { CookieNotice } from "./cookie-notice";

jest.mock("next/navigation", () => ({ usePathname: () => "/" }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<CookieNotice />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const dismiss = () =>
  act(() => [...container.querySelectorAll("button")].find((b) => b.textContent === "Got it")!.click());

describe("CookieNotice", () => {
  it("links to the privacy policy", () => {
    expect(container.querySelector('a[href="/privacy#cookies"]')).not.toBeNull();
  });

  it("hides once dismissed", () => {
    dismiss();
    expect(container.querySelector('[aria-label="Cookie notice"]')).toBeNull();
  });

  it("remembers the dismissal", () => {
    dismiss();
    expect(localStorage.getItem("campushomes:cookie-notice")).toBe("dismissed");
  });
});
