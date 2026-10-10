import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { PublishedNotice } from "./published-notice";

const mockApi = jest.fn();
jest.mock("../lib/api", () => ({
  ...jest.requireActual("../lib/api"),
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

const published = {
  id: "n1",
  templateKey: "listing.published",
  payload: { message: "Hunter Hostel has been verified and published by our team. Thank you so much!" },
  readAt: null,
};

function feed(rows: unknown[]) {
  mockApi.mockImplementation((path: string) => Promise.resolve(path === "/notifications" ? rows : {}));
}

describe("PublishedNotice", () => {
  it("shows an unread published notice", async () => {
    feed([published]);
    await act(async () => root.render(<PublishedNotice />));
    expect(container.textContent).toContain("Hunter Hostel has been verified and published");
  });

  it("marks the notice read as soon as it is shown", async () => {
    feed([published]);
    await act(async () => root.render(<PublishedNotice />));
    expect(mockApi).toHaveBeenCalledWith("/notifications/n1/read", { method: "POST" });
  });

  it("shows nothing once the notice has been read", async () => {
    feed([{ ...published, readAt: "2026-10-11T08:00:00Z" }]);
    await act(async () => root.render(<PublishedNotice />));
    expect(container.textContent).toBe("");
  });
});
