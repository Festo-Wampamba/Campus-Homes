import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { IDLE_TIMEOUT_MS } from "@campushomes/shared";

import {
  ACTIVITY_SIGNAL_MS,
  IDLE_SIGN_OUT_EVENT,
  IDLE_WARNING_MS,
  idleSignInUrl,
  useIdleDraft,
  useIdleTimeout,
  type IdleExpiry,
} from "./idle-timeout";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Same-origin tabs: every channel of a name hears the others, never itself. */
class FakeChannel extends EventTarget {
  static open: FakeChannel[] = [];
  constructor(readonly name: string) {
    super();
    FakeChannel.open.push(this);
  }
  postMessage(data: unknown) {
    for (const other of FakeChannel.open) {
      if (other !== this && other.name === this.name) other.dispatchEvent(new MessageEvent("message", { data }));
    }
  }
  close() {
    FakeChannel.open = FakeChannel.open.filter((channel) => channel !== this);
  }
}

let latest: { secondsLeft: number | null; staySignedIn: () => void };

function report(value: typeof latest) {
  latest = value;
}

function Probe({ onExpire }: { onExpire: (reason: IdleExpiry) => void }) {
  const result = useIdleTimeout(onExpire);
  useEffect(() => report(result));
  return null;
}

let fetchMock: jest.Mock;
let mounted: ReturnType<typeof createRoot>[] = [];

function mount() {
  const onExpire = jest.fn();
  const root = createRoot(document.createElement("div"));
  mounted.push(root);
  act(() => root.render(<Probe onExpire={onExpire} />));
  return { onExpire };
}

function advance(ms: number) {
  act(() => { jest.advanceTimersByTime(ms); });
}

function otherTab() {
  return new FakeChannel("campushomes-idle");
}

function activityPosts() {
  return fetchMock.mock.calls.filter(([url]) => url === "/api/auth/activity").length;
}

beforeEach(() => {
  jest.useFakeTimers();
  FakeChannel.open = [];
  (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = FakeChannel;
  fetchMock = jest.fn().mockResolvedValue({ status: 204 });
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  act(() => mounted.forEach((root) => root.unmount()));
  mounted = [];
  jest.useRealTimers();
});

describe("useIdleTimeout", () => {
  it("shows no warning before the final minute", () => {
    mount();
    advance(IDLE_TIMEOUT_MS - IDLE_WARNING_MS - 1_000);
    expect(latest.secondsLeft).toBeNull();
  });

  it("counts down during the final minute", () => {
    mount();
    advance(IDLE_TIMEOUT_MS - IDLE_WARNING_MS);
    expect(latest.secondsLeft).toBe(60);
  });

  it("signs out after the full idle window", () => {
    const { onExpire } = mount();
    advance(IDLE_TIMEOUT_MS);
    expect(onExpire).toHaveBeenCalledWith("idle_timeout");
  });

  it("restarts the window when the user chooses to stay signed in", () => {
    const { onExpire } = mount();
    advance(IDLE_TIMEOUT_MS - 10_000);
    act(() => latest.staySignedIn());
    advance(IDLE_TIMEOUT_MS - 10_000);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("tells the API about real interaction", () => {
    mount();
    advance(ACTIVITY_SIGNAL_MS);
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown")); });
    expect(activityPosts()).toBe(2);
  });

  it("throttles activity signals to one per window", () => {
    mount();
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown")); });
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown")); });
    expect(activityPosts()).toBe(1);
  });

  it("still sends a throttled interaction once the window passes", () => {
    mount();
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown")); });
    advance(ACTIVITY_SIGNAL_MS);
    expect(activityPosts()).toBe(2);
  });

  it("does not treat scroll events (e.g. chat auto-scroll on a poll) as activity", () => {
    const { onExpire } = mount();
    advance(IDLE_TIMEOUT_MS - 1_000);
    act(() => { document.dispatchEvent(new Event("scroll")); });
    advance(1_000);
    expect(onExpire).toHaveBeenCalledWith("idle_timeout");
  });

  it("stays signed in while another tab is in use", () => {
    const { onExpire } = mount();
    const tab = otherTab();
    advance(IDLE_TIMEOUT_MS - 10_000);
    act(() => tab.postMessage({ type: "activity", at: Date.now() }));
    advance(10_000);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("follows another tab's sign-out", () => {
    const { onExpire } = mount();
    act(() => otherTab().postMessage({ type: "expired", reason: "idle_timeout" }));
    expect(onExpire).toHaveBeenCalledWith("idle_timeout");
  });

  it("tells other tabs when it signs out", () => {
    mount();
    const tab = otherTab();
    const heard = jest.fn();
    tab.addEventListener("message", (event) => heard((event as MessageEvent).data));
    advance(IDLE_TIMEOUT_MS);
    expect(heard).toHaveBeenCalledWith({ type: "expired", reason: "idle_timeout" });
  });

  it("signs out when the API says the session already ended", async () => {
    fetchMock.mockResolvedValue({ status: 401 });
    const { onExpire } = mount();
    await act(async () => { await Promise.resolve(); });
    expect(onExpire).toHaveBeenCalledWith("session_ended");
  });
});

describe("idleSignInUrl", () => {
  it("carries the reason and the page to return to", () => {
    expect(idleSignInUrl("/staff", "idle_timeout", "/ops/inspect/v1?tab=photos"))
      .toBe("/staff?error=idle_timeout&next=%2Fops%2Finspect%2Fv1%3Ftab%3Dphotos");
  });
});

describe("useIdleDraft", () => {
  let draft: { draft: { name: string } | null; settle: () => void };

  function reportDraft(value: typeof draft) {
    draft = value;
  }

  function DraftProbe({ value }: { value: { name: string } | null }) {
    const result = useIdleDraft("test-draft", value);
    useEffect(() => reportDraft(result));
    return null;
  }

  function mountDraft(value: { name: string } | null) {
    const root = createRoot(document.createElement("div"));
    mounted.push(root);
    act(() => root.render(<DraftProbe value={value} />));
  }

  beforeEach(() => sessionStorage.clear());

  it("saves the form only when an idle sign-out happens", () => {
    mountDraft({ name: "Sunrise Hostel" });
    expect(sessionStorage.getItem("test-draft")).toBeNull();
  });

  it("offers the saved form back after signing in again", () => {
    mountDraft({ name: "Sunrise Hostel" });
    act(() => { window.dispatchEvent(new Event(IDLE_SIGN_OUT_EVENT)); });
    mountDraft(null);
    expect(draft.draft).toEqual({ name: "Sunrise Hostel" });
  });

  it("forgets the draft once restored or discarded", () => {
    sessionStorage.setItem("test-draft", JSON.stringify({ name: "Sunrise Hostel" }));
    mountDraft(null);
    act(() => draft.settle());
    expect(sessionStorage.getItem("test-draft")).toBeNull();
  });

  it("ignores an unreadable stored draft", () => {
    sessionStorage.setItem("test-draft", "{not json");
    mountDraft(null);
    expect(draft.draft).toBeNull();
  });
});
