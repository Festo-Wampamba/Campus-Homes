"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/** Returns wherever the user actually came from (home, search, a shared
 * link) instead of assuming — a hardcoded "back to search" link is wrong
 * when someone arrived from the landing page. Falls back to fallbackHref
 * only when there's no in-app history to go back to (e.g. a direct link
 * opened in a new tab). */
export function BackButton({ fallbackHref, label }: { fallbackHref: string; label: string }) {
  const router = useRouter();

  function goBack() {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft aria-hidden className="size-4" />
      {label}
    </button>
  );
}
