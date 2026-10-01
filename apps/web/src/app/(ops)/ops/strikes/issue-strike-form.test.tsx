import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ApiError } from "../../../../lib/api";

import { IssueStrikeForm } from "./issue-strike-form";

const mockApi = jest.fn();
jest.mock("../../../../lib/api", () => ({
  ...jest.requireActual("../../../../lib/api"),
  api: (...args: unknown[]) => mockApi(...args),
}));

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
  mockApi.mockReset();
});

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

async function submitStrike() {
  await act(async () => root.render(<IssueStrikeForm />));
  await act(async () => {
    setValue(container.querySelector("#landlordId")!, "11111111-1111-4111-8111-111111111111");
    setValue(container.querySelector("#reason")!, "no_show");
  });
  await act(async () => {
    container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

describe("IssueStrikeForm", () => {
  it("links to a fresh staff sign-in when the API demands one", async () => {
    mockApi.mockRejectedValue(new ApiError(401, { message: "strikes.issue requires a fresh sign-in" }));

    await submitStrike();

    const link = container.querySelector('[role="alert"] a');
    expect(link?.getAttribute("href")).toBe("/api/auth/logto/sign-in?portal=staff&intent=staff&next=%2Fops%2Fstrikes");
  });

  it("does not show the raw step-up message", async () => {
    mockApi.mockRejectedValue(new ApiError(401, { message: "strikes.issue requires a fresh sign-in" }));

    await submitStrike();

    expect(container.textContent).not.toContain("strikes.issue requires");
  });

  it("still shows other API errors verbatim", async () => {
    mockApi.mockRejectedValue(new ApiError(404, { message: "Landlord not found" }));

    await submitStrike();

    expect(container.textContent).toContain("Landlord not found");
  });
});
