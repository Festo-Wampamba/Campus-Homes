import Link from "next/link";
import { Building2, MapPin } from "lucide-react";

import type { ListingSearchResult } from "@campushomes/shared";

import { listingPhotoUrl } from "@/lib/cloudinary";
import { formatPriceRange, humanizeKey, roomSizeLabel } from "@/lib/format";
import { VerifiedBadge } from "@/components/verified-badge";

function FeaturedCard({ row }: { row: ListingSearchResult }) {
  const amenities = Object.entries(row.amenities)
    .filter(([, has]) => has)
    .map(([key]) => humanizeKey(key))
    .slice(0, 3);
  const initial = row.name.charAt(0).toUpperCase();
  const photoUrl = row.photo_storage_key ? listingPhotoUrl(row.photo_storage_key, 500) : null;
  const rooms = roomSizeLabel(row);

  return (
    <li>
      <Link
        href={`/listings/${row.id}`}
        className="group block h-full overflow-hidden rounded-lg border border-border bg-card shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="relative flex h-40 items-center justify-center overflow-hidden bg-gradient-to-br from-teal-700 to-teal-900">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- unpredictable/hotlinked seed hosts, not worth next/image's remote-pattern allowlist churn for a card thumbnail
            <img
              src={photoUrl}
              alt={row.name}
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            <>
              <span
                aria-hidden
                className="font-display text-6xl font-bold text-white/15 select-none"
              >
                {initial}
              </span>
              <Building2
                aria-hidden
                className="absolute size-8 text-white/70"
                strokeWidth={1.5}
              />
            </>
          )}
          <VerifiedBadge size="sm" className="absolute top-3 left-3" />
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-lg leading-snug group-hover:text-teal-700">
              {row.name}
            </h3>
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin aria-hidden className="size-3.5 shrink-0" />
            {row.street_address}
          </p>
          {rooms && <p className="mt-2 text-sm text-muted-foreground">{rooms}</p>}
          {amenities.length > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {amenities.join(" · ")}
            </p>
          )}
          <p className="tabular mt-3 font-display text-lg font-semibold text-foreground">
            {row.room_categories.length > 1 && (
              <span className="mr-1 text-sm font-normal text-muted-foreground">From</span>
            )}
            {formatPriceRange(row.price_per_term_ugx, row.max_price_per_term_ugx)}
            <span className="text-sm font-normal text-muted-foreground"> / semester</span>
          </p>
          {row.room_categories.length > 1 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {row.room_categories.length} room types
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}

export { FeaturedCard };
