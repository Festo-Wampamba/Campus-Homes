import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { MobileNav } from "./mobile-nav";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LINKS = [
  { href: "/search", label: "Find a room" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/support", label: "Support" },
  { href: "/landlords", label: "For landlords" },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<MobileNav links={LINKS} />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function toggle() {
  return container.querySelector<HTMLButtonElement>("button[aria-controls='mobile-nav-panel']")!;
}

async function openMenu() {
  await act(async () => toggle().click());
}

describe("MobileNav", () => {
  it("starts closed", () => {
    expect(container.querySelector("#mobile-nav-panel")).toBeNull();
  });

  it("lists every page link when opened", async () => {
    await openMenu();

    const labels = [...container.querySelectorAll("#mobile-nav-panel a")].map((a) => a.textContent);
    expect(labels).toEqual(["Find a room", "How it works", "Support", "For landlords"]);
  });

  it("reports its open state to assistive tech", async () => {
    await openMenu();

    expect(toggle().getAttribute("aria-expanded")).toBe("true");
  });

  it("closes on Escape", async () => {
    await openMenu();

    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));

    expect(container.querySelector("#mobile-nav-panel")).toBeNull();
  });

  it("closes on a click outside the menu", async () => {
    await openMenu();

    await act(async () => document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));

    expect(container.querySelector("#mobile-nav-panel")).toBeNull();
  });

  it("closes after a link is chosen", async () => {
    await openMenu();

    await act(async () => container.querySelector<HTMLAnchorElement>("#mobile-nav-panel a")!.click());

    expect(container.querySelector("#mobile-nav-panel")).toBeNull();
  });
});
