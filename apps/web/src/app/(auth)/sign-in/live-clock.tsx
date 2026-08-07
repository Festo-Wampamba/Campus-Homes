"use client";

import { useSyncExternalStore } from "react";

// Date.now() differs between server and client by definition, so this can
// never render a real value during SSR without a hydration mismatch —
// useSyncExternalStore's getServerSnapshot sentinel (0) lets the component
// render nothing until the real client clock is available, same technique
// as lib/recently-viewed.ts's useSyncExternalStore usage.
//
// getSnapshot must return the SAME value between store notifications, or
// React sees a "changed" value on every re-render check and loops forever
// (Date.now() changes on literally every call) — so the timestamp is only
// ever refreshed inside the interval tick, not read live in getSnapshot.
let cachedNow = Date.now();

function subscribe(callback: () => void) {
  const id = setInterval(() => {
    cachedNow = Date.now();
    callback();
  }, 1000);
  return () => clearInterval(id);
}

function getSnapshot() {
  return cachedNow;
}

function getServerSnapshot() {
  return 0;
}

export function LiveClock() {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (now === 0) return null;

  const date = new Date(now);
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const label = date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div aria-hidden className="pointer-events-none select-none">
      <p className="font-display text-5xl font-bold text-white/90 sm:text-6xl">{time}</p>
      <p className="mt-1 text-sm text-white/70 sm:text-base">{label}</p>
    </div>
  );
}
