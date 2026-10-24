import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ApiError } from "../../lib/api";
import { SupportTabs, type SupportTab } from "./support-tabs";

const mockApi = jest.fn();
jest.mock("../../lib/api", () => ({
  ...jest.requireActual("../../lib/api"),
  api: (...args: unknown[]) => mockApi(...args),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function render(initialTab: SupportTab = "ai") {
  await act(async () =>
    root.render(<SupportTabs initialTab={initialTab} />),
  );
}

function setValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = Object.getPrototypeOf(element) as object;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

async function ask(question: string) {
  await act(async () => setValue(container.querySelector("textarea")!, question));
  await act(async () => container.querySelector("form")!.requestSubmit());
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

it("opens on CampusHomes AI by default", async () => {
  await render();

  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute("aria-label")).toBe("Ask CampusHomes AI");
});

it("shows CampusHomes AI's answer to a question", async () => {
  mockApi.mockResolvedValue({ reply: "A room is held for 24 hours." });
  await render();
  await ask("How long is a hold?");

  expect(container.querySelector('[role="log"]')?.textContent).toContain("A room is held for 24 hours.");
});

it("sends the conversation with the question last", async () => {
  mockApi.mockResolvedValue({ reply: "24 hours." });
  await render();
  await ask("How long is a hold?");

  expect(JSON.parse(mockApi.mock.calls[0][1].body)).toEqual({
    messages: [{ role: "user", content: "How long is a hold?" }],
  });
});

it("explains when CampusHomes AI is unavailable", async () => {
  mockApi.mockRejectedValue(
    new ApiError(503, { message: "CampusHomes AI is not available right now. Try the user manual or contact us." }),
  );
  await render();
  await ask("How long is a hold?");

  expect(container.querySelector('[role="alert"]')?.textContent).toContain("not available right now");
});

it("links to the dedicated contact page instead of nesting contact in a tab", async () => {
  await render();
  expect(container.querySelector('a[href="/contact"]')?.textContent).toBe("Contact Us");
  expect(container.querySelectorAll('[role="tab"]')).toHaveLength(2);
});

it("narrows the user manual to matching steps", async () => {
  await render("manual");
  await act(async () => setValue(container.querySelector<HTMLInputElement>('input[type="search"]')!, "Request booking"));

  expect([...container.querySelectorAll("section h2")].map((h) => h.textContent)).toContain("Booking a room");
});

it("says when nothing in the manual matches", async () => {
  await render("manual");
  await act(async () => setValue(container.querySelector<HTMLInputElement>('input[type="search"]')!, "zzzz-nothing"));

  expect(container.textContent).toContain("Nothing in the manual matches");
});
