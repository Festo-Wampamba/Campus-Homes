import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ListingShare } from "./listing-share";
import { LandlordSummary } from "./landlord-summary";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
const copy = jest.fn();
beforeEach(() => {
  container = document.createElement("div");document.body.appendChild(container);root = createRoot(container);
  window.history.replaceState(null, "", "/listings/public-hostel?room=single&intent=reserve#questions");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
  copy.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { act(() => root.unmount());container.remove(); });

it("shares only the public hostel and selected room using WhatsApp, copy and email", async () => {
  await act(async () => root.render(<ListingShare propertyName="Kikoni & Rise" />));
  const whatsapp = container.querySelector('a[aria-label="Share on WhatsApp"]') as HTMLAnchorElement;
  const url = new URL(whatsapp.href);
  expect(url.hostname).toBe("wa.me");
  expect(url.searchParams.get("text")).toContain("Kikoni & Rise");
  expect(url.searchParams.get("text")).not.toMatch(/intent|#questions/);
  expect(container.querySelector('a[href^="mailto:"]')).not.toBeNull();
  expect(container.innerHTML).not.toContain("facebook");
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Copy hostel link"]')!.click());
  expect(copy).toHaveBeenCalledWith(`${window.location.origin}/listings/public-hostel?room=single`);
  expect(container.querySelector('[role="status"]')?.textContent).toBe("Hostel link copied.");
});

it("provides a selectable link when clipboard access fails", async () => {
  copy.mockRejectedValue(new Error("Permission denied"));
  await act(async () => root.render(<ListingShare propertyName="Kikoni" />));
  await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.querySelector<HTMLInputElement>('input')?.readOnly).toBe(true);
});

it("shows genuine landlord history and keeps absent statistics explicit", async () => {
  await act(async () => root.render(<LandlordSummary landlord={null} />));
  expect(container.textContent).toContain("Reply speed not established yet");
  expect(container.textContent).not.toContain("Trusted landlord");
  await act(async () => root.render(<LandlordSummary landlord={{ displayName: "Kikoni team", joinedAt: "2025-01-15T09:00:00Z", responseRate: 80, within24HoursRate: 60 }} />));
  expect(container.textContent).toContain("January 2025");
  expect(container.textContent).toContain("60% answered within 24 hours");
  expect(container.textContent).toContain("80% of inquiries answered");
});
