"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Building2, Clock, MapPin } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { listingPhotoUrl } from "@/lib/cloudinary";
import { formatUgx } from "@/lib/format";
import { getRecentlyViewed } from "@/lib/recently-viewed";

// localStorage doesn't exist during SSR — useSyncExternalStore is the
// primitive built for exactly this (server snapshot = null, matching what
// the server rendered, then the real client value right after hydration).
function subscribe() {
  return () => {};
}

export function RecentlyViewedClient() {
  const entries = useSyncExternalStore(subscribe, getRecentlyViewed, () => null);

  if (entries === null) return null;

  if (entries.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState
          icon={Clock}
          title="Nothing viewed yet"
          body="Listings you open show up here — this list lives in your browser, not your account."
        />
      </div>
    );
  }

  return (
    <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((entry) => {
        const photoUrl = entry.photoStorageKey ? listingPhotoUrl(entry.photoStorageKey, 500) : null;
        return (
          <li key={entry.id}>
            <Link
              href={`/listings/${entry.id}`}
              className="group block h-full overflow-hidden rounded-lg border border-border bg-card shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="relative flex h-40 items-center justify-center overflow-hidden bg-gradient-to-br from-teal-700 to-teal-900">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- unpredictable/hotlinked seed hosts, not worth next/image's remote-pattern allowlist churn for a card thumbnail
                  <img src={photoUrl} alt={entry.name} className="size-full object-cover" loading="lazy" />
                ) : (
                  <Building2 aria-hidden className="absolute size-8 text-white/70" strokeWidth={1.5} />
                )}
              </div>
              <div className="p-4">
                <h3 className="text-lg leading-snug group-hover:text-teal-700">{entry.name}</h3>
                <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin aria-hidden className="size-3.5 shrink-0" />
                  {entry.streetAddress}
                </p>
                <p className="tabular mt-3 font-display text-lg font-semibold text-foreground">
                  {formatUgx(entry.priceUgx)}
                  <span className="text-sm font-normal text-muted-foreground"> / semester</span>
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
