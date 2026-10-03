"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import type { TrackEvent } from "@campushomes/shared";

// Staff consoles would drown out real visitor traffic.
const UNTRACKED_PREFIXES = ["/admin", "/ops"];

function send(event: TrackEvent) {
  if (UNTRACKED_PREFIXES.some((prefix) => event.path.startsWith(prefix))) return;
  const body = new Blob([JSON.stringify(event)], { type: "application/json" });
  // sendBeacon survives the page unloading after a CTA click; fetch is the fallback.
  if (!navigator.sendBeacon?.("/api/v1/events", body)) {
    void fetch("/api/v1/events", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
  }
}

/** First-party, cookieless page-view and CTA-click logging (see privacy policy). */
export function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    send({ type: "page_view", path: pathname });
  }, [pathname]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = (event.target as Element | null)?.closest<HTMLElement>("[data-cta]");
      if (target?.dataset.cta) send({ type: "cta_click", path: window.location.pathname, cta: target.dataset.cta });
    }
    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, []);

  return null;
}
