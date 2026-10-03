"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "campushomes:cookie-notice";

// Informational, not a consent gate: the site sets only essential cookies
// (sign-in session) and its analytics is first-party and cookieless.
// If a tracking or advertising tool is ever added, this must become a
// real opt-in that blocks that tool until the visitor accepts.
const subscribe = () => () => {};

function readDismissed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dismissed";
  } catch {
    return false;
  }
}

export function CookieNotice() {
  // Server snapshot says "dismissed" so the notice never flashes into SSR HTML.
  const isStoredDismissed = useSyncExternalStore(subscribe, readDismissed, () => true);
  const [isDismissed, setIsDismissed] = useState(false);

  function dismiss() {
    setIsDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, "dismissed");
    } catch {
      // Storage blocked: the notice simply shows again next visit.
    }
  }

  if (isStoredDismissed || isDismissed) return null;
  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-2xl flex-col gap-3 rounded-lg border border-border bg-card p-4 text-sm text-card-foreground shadow-lg sm:flex-row sm:items-center sm:gap-5"
    >
      <p className="leading-6">
        We only use essential cookies to keep you signed in. No advertising or tracking cookies.{" "}
        <Link href="/privacy#cookies" className="font-semibold text-teal-700 underline underline-offset-4 dark:text-teal-300">
          Privacy policy
        </Link>
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-teal-900 px-5 font-bold text-white transition-colors hover:bg-teal-700"
      >
        OK
      </button>
    </div>
  );
}
