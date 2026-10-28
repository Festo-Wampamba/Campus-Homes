import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { landlordAgreement } from "../content/landlord-agreement";
import { privacyPolicy, termsAndConditions } from "../content/legal-documents";
import { LegalPage } from "./legal-page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it.each([privacyPolicy, termsAndConditions, landlordAgreement])("labels $kind as a draft, not final", async (document) => {
  await act(async () => root.render(<LegalPage document={document} />));
  expect(container.querySelector('[role="note"]')?.textContent).toContain("Draft, not final");
});

it.each([privacyPolicy, termsAndConditions, landlordAgreement])("offers no file download on the $kind page", async (document) => {
  await act(async () => root.render(<LegalPage document={document} />));
  expect(container.querySelector("a[download]")).toBeNull();
});

it.each([privacyPolicy, termsAndConditions, landlordAgreement])("gives every $kind contents link a unique visible section", async (document) => {
  await act(async () => root.render(<LegalPage document={document} />));
  const links = container.querySelectorAll('nav[aria-label="On this page"] a');
  expect(links.length).toBeGreaterThan(10);
  for (const link of links) {
    const target = container.querySelectorAll(link.getAttribute("href")!);
    expect(target).toHaveLength(1);
    expect(target[0].querySelector("h2")?.textContent).toBe(link.textContent);
  }
});

it("discloses the AI recipient and stored search terms and preserves the cookies anchor", async () => {
  await act(async () => root.render(<LegalPage document={privacyPolicy} />));
  expect(container.querySelector("#ai")?.textContent).toContain("Groq");
  expect(container.querySelector("#what-we-collect")?.textContent).toContain("records submitted search text");
  expect(container.querySelector("#sensitive-data")?.textContent).toContain("financial information");
  expect(container.querySelector("#cookies")).not.toBeNull();
});

it("distinguishes a free hold from direct landlord payments and preserves statutory rights", async () => {
  await act(async () => root.render(<LegalPage document={termsAndConditions} />));
  expect(container.querySelector("#reservations")?.textContent).toContain("takes no reservation payment");
  expect(container.querySelector("#bookings")?.textContent).toContain("Pay rent, deposits and lawful landlord charges directly");
  expect(container.querySelector("#cancellation")?.textContent).toContain("Nothing in these terms waives or reduces a non-excludable right");
});

it.each([privacyPolicy, termsAndConditions])("does not link $kind to the landlord agreement", async (document) => {
  await act(async () => root.render(<LegalPage document={document} />));
  expect(container.querySelector('a[href^="/landlord-agreement"]')).toBeNull();
});
