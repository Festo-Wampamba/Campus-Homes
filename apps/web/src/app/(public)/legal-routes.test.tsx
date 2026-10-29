import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import PrivacyPage, { generateMetadata as privacyMetadata } from "./privacy/page";
import TermsPage, { generateMetadata as termsMetadata } from "./terms/page";

jest.mock("../../lib/support-contact", () => ({ getSupportEmail: async () => "help@example.test" }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const routes = [
  { name: "privacy", Page: PrivacyPage, metadata: privacyMetadata },
  { name: "terms", Page: TermsPage, metadata: termsMetadata },
];

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
  delete process.env.LEGAL_DRAFT_PREVIEW;
});

async function render(Page: () => Promise<React.ReactElement>) {
  const element = await Page();
  await act(async () => root.render(element));
}

it.each(routes)("serves the in-force $name page when the draft flag is unset", async ({ Page }) => {
  await render(Page);
  expect(container.textContent).toContain("Last updated 29 September 2026");
});

it.each(routes)("shows no draft notice on the in-force $name page", async ({ Page }) => {
  await render(Page);
  expect(container.querySelector('[role="note"]')).toBeNull();
});

it.each(routes)("leaves the in-force $name page indexable", ({ metadata }) => {
  expect(metadata().robots).toBeUndefined();
});

it.each(routes)("serves the $name review draft when LEGAL_DRAFT_PREVIEW=true", async ({ Page }) => {
  process.env.LEGAL_DRAFT_PREVIEW = "true";
  await render(Page);
  expect(container.querySelector('[role="note"]')?.textContent).toContain("Draft, not final");
});

it.each(routes)("marks the $name review draft noindex", ({ metadata }) => {
  process.env.LEGAL_DRAFT_PREVIEW = "true";
  expect(metadata().robots).toEqual({ index: false, follow: true });
});
