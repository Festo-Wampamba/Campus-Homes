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
    <div
      aria-hidden
      className="pointer-events-none inline-flex select-none flex-col rounded-2xl border border-teal-900/15 bg-white/95 px-4 py-3 shadow-lg shadow-teal-950/10 backdrop-blur-sm dark:border-teal-100/15 dark:bg-slate-950/90 dark:shadow-black/25"
    >
      <p className="font-display text-4xl font-bold leading-none tracking-tight text-teal-950 tabular-nums dark:text-white sm:text-5xl">{time}</p>
      <p className="mt-1 text-xs font-semibold text-teal-800/85 dark:text-white/80 sm:text-sm">{label}</p>
    </div>
  );
}
