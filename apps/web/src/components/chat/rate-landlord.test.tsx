import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { RateLandlord } from "./rate-landlord";

const mockApi = jest.fn();
jest.mock("../../lib/api", () => ({
  ...jest.requireActual("../../lib/api"),
  api: (...args: unknown[]) => mockApi(...args),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom's <dialog> has no working showModal/close.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  this.removeAttribute("open");
};

const LANDLORD = "5f0c2a9e-1111-4222-8333-444455556666";
const RATING = { rating: 4, comment: "Replies fast", createdAt: "2026-10-23T08:00:00.000Z" };

let container: HTMLDivElement;
let root: Root;

async function render(mine: unknown) {
  mockApi.mockResolvedValueOnce(mine);
  await act(async () => root.render(<RateLandlord landlordId={LANDLORD} hasMessaged />));
}

const button = (name: string) =>
  Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes(name));

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

it("offers a rating when the student reserved and messaged", async () => {
  await render({ canRate: true, rating: null });

  expect(button("Rate landlord")).toBeDefined();
});

it("shows nothing when the student may not rate yet", async () => {
  await render({ canRate: false, rating: null });

  expect(container.textContent).toBe("");
});

it("shows the student's own rating instead of a button", async () => {
  await render({ canRate: false, rating: RATING });

  expect(container.querySelector('[aria-label="4 out of 5 stars"]')).not.toBeNull();
});

it("sends the chosen stars and comment for this landlord", async () => {
  await render({ canRate: true, rating: null });
  await act(async () => button("Rate landlord")!.click());
  const fourStars = container.querySelector<HTMLInputElement>('input[name="landlord-rating"][value="4"]')!;
  const comment = container.querySelector("textarea")!;
  await act(async () => {
    fourStars.click();
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    setValue.call(comment, "  Replies fast  ");
    comment.dispatchEvent(new Event("input", { bubbles: true }));
  });
  mockApi.mockResolvedValueOnce(RATING);

  await act(async () => button("Submit rating")!.click());

  expect(mockApi).toHaveBeenLastCalledWith("/landlord-ratings", {
    method: "POST",
    body: JSON.stringify({ landlordId: LANDLORD, rating: 4, comment: "Replies fast" }),
  });
});
