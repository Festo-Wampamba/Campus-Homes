"use client";

import { useEffect } from "react";

/** Re-fetches a page's server data while something is waiting on someone
 * else (e.g. a room change under Ops review), so their decision shows up
 * without a manual reload. Skips hidden tabs and catches up when the tab is
 * shown again. */
export function useRefreshWhile(active: boolean, refresh: () => void, everyMs: number): void {
  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => { if (!document.hidden) refresh(); }, everyMs);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, refresh, everyMs]);
}
