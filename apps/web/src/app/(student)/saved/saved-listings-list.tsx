"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2, Heart, MapPin } from "lucide-react";
import type { ListingSearchResult } from "@campushomes/shared";

import { api } from "@/lib/api";
import { listingPhotoUrl } from "@/lib/cloudinary";
import { formatPriceRange, humanizeKey, roomSizeLabel } from "@/lib/format";
import { VerifiedBadge } from "@/components/verified-badge";

export function SavedListingsList({ initial }: { initial: ListingSearchResult[] }) {
  const [listings, setListings] = useState(initial);

  async function remove(listingId: string) {
    setListings((prev) => prev.filter((row) => row.id !== listingId)); // optimistic
    try {
      await api(`/students/saved-listings/${listingId}`, { method: "DELETE" });
    } catch {
      setListings(initial); // roll back to the last known-good server state
    }
  }

  if (listings.length === 0) {
    return <p className="mt-6 text-sm text-muted-foreground">All caught up — nothing saved right now.</p>;
  }

  return (
    <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {listings.map((row) => {
        const amenities = Object.entries(row.amenities)
          .filter(([, has]) => has)
          .map(([key]) => humanizeKey(key))
          .slice(0, 3);
        const photoUrl = row.photo_storage_key ? listingPhotoUrl(row.photo_storage_key, 500) : null;
        const rooms = roomSizeLabel(row);

        return (
          <li key={row.id} className="relative">
            <button
              type="button"
              onClick={() => remove(row.id)}
              aria-label="Remove from favourites"
              className="absolute top-3 right-3 z-10 flex size-9 items-center justify-center rounded-full bg-white/90 shadow-md transition-colors hover:bg-white"
            >
              <Heart aria-hidden className="size-4 fill-coral-500 text-coral-500" />
            </button>
            <Link
              href={`/listings/${row.id}`}
              className="group block h-full overflow-hidden rounded-lg border border-border bg-card shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="relative flex h-40 items-center justify-center overflow-hidden bg-gradient-to-br from-teal-700 to-teal-900">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- unpredictable/hotlinked seed hosts, not worth next/image's remote-pattern allowlist churn for a card thumbnail
                  <img src={photoUrl} alt={row.name} className="size-full object-cover" loading="lazy" />
                ) : (
                  <Building2 aria-hidden className="absolute size-8 text-white/70" strokeWidth={1.5} />
                )}
                <VerifiedBadge size="sm" className="absolute top-3 left-3" />
              </div>
              <div className="p-4">
                <h3 className="text-lg leading-snug group-hover:text-teal-700">{row.name}</h3>
                <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin aria-hidden className="size-3.5 shrink-0" />
                  {row.street_address}
                </p>
                {rooms && <p className="mt-2 text-sm text-muted-foreground">{rooms}</p>}
                {amenities.length > 0 && (
                  <p className="mt-1 text-sm text-muted-foreground">{amenities.join(" · ")}</p>
                )}
                <p className="tabular mt-3 font-display text-lg font-semibold text-foreground">
                  {formatPriceRange(row.price_per_term_ugx, row.max_price_per_term_ugx)}
                  <span className="text-sm font-normal text-muted-foreground"> / bed / semester</span>
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
