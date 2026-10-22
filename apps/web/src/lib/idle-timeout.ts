"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { IDLE_TIMEOUT_MS } from "@campushomes/shared";

export const IDLE_WARNING_MS = 60_000;
// At most one activity signal per window. A trailing one follows interaction
// inside the window, so the server's last-activity never trails the user's.
export const ACTIVITY_SIGNAL_MS = 30_000;
const CHANNEL = "campushomes-idle";
// Real interaction only. `scroll` is left out on purpose: chat auto-scrolls
// when a poll brings a new message, which would keep an unattended session
// alive. Wheel, touch and keys cover scrolling by the user.
const INTERACTION_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/** Fired just before an idle sign-out navigates away; long forms save on it. */
export const IDLE_SIGN_OUT_EVENT = "campushomes:idle-sign-out";

export type IdleExpiry = "idle_timeout" | "session_ended";
type IdleMessage = { type: "activity"; at: number } | { type: "expired"; reason: IdleExpiry };

/** Tracks real interaction across every tab of this origin and mirrors the
 * API's inactivity window (the API is the enforcement; this only warns and
 * redirects in time). `secondsLeft` is non-null during the final warning. */
export function useIdleTimeout(onExpire: (reason: IdleExpiry) => void) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const onExpireRef = useRef(onExpire);
  const stayRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    let lastActivity = Date.now();
    let lastSignal = 0;
    let trailing: number | undefined;
    let warning = false;
    let expired = false;
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);

    function expire(reason: IdleExpiry, broadcast: boolean) {
      if (expired) return;
      expired = true;
      if (broadcast) channel?.postMessage({ type: "expired", reason } satisfies IdleMessage);
      onExpireRef.current(reason);
    }

    function signal() {
      window.clearTimeout(trailing);
      trailing = undefined;
      lastSignal = lastActivity = Date.now();
      channel?.postMessage({ type: "activity", at: lastActivity } satisfies IdleMessage);
      void fetch("/api/auth/activity", { method: "POST", credentials: "include" })
        .then((res) => { if (res.status === 401) expire("session_ended", true); })
        // Offline: nothing to do, the API's own window still applies.
        .catch(() => undefined);
    }

    function tick() {
      const left = lastActivity + IDLE_TIMEOUT_MS - Date.now();
      if (left <= 0) return expire("idle_timeout", true);
      warning = left <= IDLE_WARNING_MS;
      setSecondsLeft(warning ? Math.ceil(left / 1000) : null);
    }

    function interact() {
      // During the warning only "Stay signed in" (or another tab) counts, so
      // the dialog can't vanish under a stray key press.
      if (warning || expired) return;
      const since = Date.now() - lastSignal;
      if (since >= ACTIVITY_SIGNAL_MS) signal();
      else trailing ??= window.setTimeout(signal, ACTIVITY_SIGNAL_MS - since);
    }

    function onMessage(event: MessageEvent<IdleMessage>) {
      if (event.data.type === "expired") return expire(event.data.reason, false);
      lastActivity = Math.max(lastActivity, event.data.at);
      lastSignal = Math.max(lastSignal, event.data.at);
      tick();
    }

    // Background tabs' timers get throttled; catch up the moment one is shown.
    function onVisible() {
      if (!document.hidden) tick();
    }

    stayRef.current = () => {
      warning = false;
      signal();
      tick();
    };
    channel?.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onVisible);
    for (const type of INTERACTION_EVENTS) document.addEventListener(type, interact, { capture: true, passive: true });
    // Loading a signed-in page is itself activity (a click, a typed URL).
    signal();
    const interval = window.setInterval(tick, 1_000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(trailing);
      for (const type of INTERACTION_EVENTS) document.removeEventListener(type, interact, { capture: true });
      document.removeEventListener("visibilitychange", onVisible);
      channel?.close();
    };
  }, []);

  const staySignedIn = useCallback(() => stayRef.current(), []);
  return { secondsLeft, staySignedIn };
}

/** Where an idle (or otherwise ended) session lands: the portal's own sign-in
 * page, with a reason it can explain and the page to come back to. */
export function idleSignInUrl(signInPath: string, reason: IdleExpiry, currentPath: string): string {
  return `${signInPath}?${new URLSearchParams({ error: reason, next: currentPath }).toString()}`;
}

function readStored(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

const noSubscription = () => () => undefined;

/** Keeps a long form's unsaved values across an inactivity sign-out. They go
 * to this tab's sessionStorage only at sign-out (gone when the tab closes)
 * and are offered back once: `settle()` after restoring or discarding.
 * `value` null = nothing worth keeping right now. */
export function useIdleDraft<T>(key: string, value: T | null) {
  const stored = useSyncExternalStore(noSubscription, () => readStored(key), () => null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (value === null) return;
    const save = () => {
      try {
        sessionStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Storage blocked or full: the form is lost as it would be without this.
      }
    };
    window.addEventListener(IDLE_SIGN_OUT_EVENT, save);
    return () => window.removeEventListener(IDLE_SIGN_OUT_EVENT, save);
  }, [key, value]);

  const settle = useCallback(() => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Nothing stored to clear.
    }
    setSettled(true);
  }, [key]);

  let draft: T | null = null;
  try {
    if (!settled && stored) draft = JSON.parse(stored) as T;
  } catch {
    // Unreadable: offer nothing rather than crash the form.
  }
  return { draft, settle };
}
