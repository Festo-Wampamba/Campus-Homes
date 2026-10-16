import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ChatMessage, ChatThread, ThreadPresence } from "@campushomes/shared";

import { ChatInbox } from "./chat-inbox";

const THREAD_ID = "11111111-1111-4111-8111-111111111111";
const ME = "22222222-2222-4222-8222-222222222222";
const LANDLORD = "33333333-3333-4333-8333-333333333333";

const thread: ChatThread = {
  id: THREAD_ID,
  reservationId: null,
  studentId: ME,
  landlordId: LANDLORD,
  lastMessageAt: "2026-10-16T09:00:00.000Z",
  counterpartName: "Hunter Hostel Landlord",
  counterpartKind: "landlord",
  counterpartOnline: false,
};

function message(id: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    threadId: THREAD_ID,
    fromUserId: ME,
    body: `Message ${id}`,
    sentAt: "2026-10-16T09:00:00.000Z",
    readAt: null,
    deliveredAt: null,
    ...overrides,
  };
}

let messages: ChatMessage[] = [];
let presence: ThreadPresence = { online: false, lastSeenAt: null, typing: false };
let sendFails = false;
let threadList: ChatThread[] = [thread];

const mockApi = jest.fn(async (path: string, init?: RequestInit) => {
  if (path === `/chat/threads/${THREAD_ID}/messages` && init?.method === "POST") {
    if (sendFails) throw new Error("network down");
    return message("99999999-9999-4999-8999-999999999999", { body: JSON.parse(String(init.body)).body });
  }
  if (path === `/chat/threads/${THREAD_ID}/messages`) return [...messages].reverse();
  if (path === `/chat/threads/${THREAD_ID}/presence`) return presence;
  if (path === "/chat/threads") return threadList;
  return {};
});
jest.mock("../../lib/api", () => ({
  ...jest.requireActual("../../lib/api"),
  api: (path: string, init?: RequestInit) => mockApi(path, init),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/messages",
  useSearchParams: () => new URLSearchParams(`thread=${THREAD_ID}`),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function render(threads: ChatThread[] = [thread]) {
  threadList = threads;
  await act(async () => root.render(<ChatInbox initialThreads={threads} currentUserId={ME} />));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function tickLabels() {
  return [...container.querySelectorAll('[role="img"]')].map((el) => el.getAttribute("aria-label"));
}

function header() {
  return container.querySelector("header")?.textContent ?? "";
}

beforeEach(() => {
  messages = [];
  presence = { online: false, lastSeenAt: null, typing: false };
  sendFails = false;
  mockApi.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("shows one tick for a message the landlord hasn't received", async () => {
  messages = [message("aaaaaaaa-0000-4000-8000-000000000001")];
  await render();

  expect(tickLabels()).toContain("Sent");
});

it("shows two grey ticks once the landlord had CampusHomes open", async () => {
  messages = [message("aaaaaaaa-0000-4000-8000-000000000001", { deliveredAt: "2026-10-16T09:01:00.000Z" })];
  await render();

  expect(tickLabels()).toContain("Delivered");
});

it("shows blue ticks once the landlord read it", async () => {
  messages = [
    message("aaaaaaaa-0000-4000-8000-000000000001", {
      deliveredAt: "2026-10-16T09:01:00.000Z",
      readAt: "2026-10-16T09:02:00.000Z",
    }),
  ];
  await render();

  expect(tickLabels()).toContain("Read");
});

it("says the landlord is online", async () => {
  presence = { online: true, lastSeenAt: null, typing: false };
  await render();

  expect(header()).toContain("Online");
});

it("says when the landlord is typing", async () => {
  presence = { online: true, lastSeenAt: null, typing: true };
  await render();

  expect(header()).toContain("typing…");
});

it("says when the landlord was last seen", async () => {
  presence = { online: false, lastSeenAt: "2025-12-30T09:00:00.000Z", typing: false };
  await render();

  expect(header()).toContain("last seen 30 Dec 2025");
});

it("marks an online landlord in the conversation list", async () => {
  await render([{ ...thread, counterpartOnline: true }]);

  expect(tickLabels()).toContain("Online");
});

it("offers Retry when a message fails to send", async () => {
  sendFails = true;
  await render();
  const box = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, "Is the room free?");
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Send message"]')!.click());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Not sent");
});
