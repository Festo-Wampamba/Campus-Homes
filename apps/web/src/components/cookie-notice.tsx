"use client";

import Link from "next/link";
import { Cookie } from "lucide-react";
import { usePathname } from "next/navigation";
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
  const pathname = usePathname();
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
  // Listing pages keep it in the flow: their phone reservation bar owns the
  // bottom edge. Everywhere else it is a slim bar along the bottom edge; the
  // WhatsApp shortcut lifts itself above it (floating-whatsapp.tsx).
  const isInline = pathname?.startsWith("/listings/");
  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className={
        isInline
          ? "relative mx-3 mt-4 mb-36 rounded-lg border border-border bg-card text-card-foreground sm:mx-auto sm:max-w-3xl lg:mb-4"
          : "fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 text-card-foreground shadow-[0_-4px_16px_rgb(0_0_0/0.08)] backdrop-blur supports-[backdrop-filter]:bg-card/90"
      }
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:flex-nowrap sm:px-6">
        <Cookie aria-hidden className="hidden size-5 shrink-0 text-teal-700 sm:block dark:text-teal-300" />
        <p className="min-w-0 flex-1 text-sm leading-5">
          We use only essential cookies to keep you signed in. No advertising or tracking cookies.{" "}
          <Link
            href="/privacy#cookies"
            className="font-semibold whitespace-nowrap text-teal-700 underline underline-offset-4 dark:text-teal-300"
          >
            Privacy policy
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-teal-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-sm:ml-auto"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
