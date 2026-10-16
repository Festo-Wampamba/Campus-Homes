"use client";

import { useEffect } from "react";

import { api } from "@/lib/api";

// The API counts you online for 60 s after a beat, so 25 s keeps a visible
// tab online with room for one slow request.
const HEARTBEAT_MS = 25_000;

/**
 * Tells CampusHomes this signed-in user has a visible tab open: they show as
 * "Online" in chats, and messages to them get two ticks. Hiding or closing
 * the tab reports "away" so "last seen" is exact. Renders nothing.
 */
export function PresenceHeartbeat() {
  useEffect(() => {
    const beat = () => {
      if (document.hidden) return;
      void api("/presence/heartbeat", { method: "POST" }).catch(() => {
        // Best effort: the next beat retries.
      });
    };
    // keepalive lets the request finish while the page is closing.
    const away = () => {
      void api("/presence/away", { method: "POST", keepalive: true }).catch(() => undefined);
    };
    const onVisibility = () => (document.hidden ? away() : beat());

    beat();
    const interval = window.setInterval(beat, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", away);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", away);
    };
  }, []);

  return null;
}
