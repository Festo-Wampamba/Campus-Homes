import { ArrowTopRightIcon, HomeIcon, SewingPinIcon } from "@radix-ui/react-icons";
import type { ListingSearchResult } from "@campushomes/shared";
import Link from "next/link";

import { VerifiedBadge } from "@/components/verified-badge";
import { listingPhotoUrl } from "@/lib/cloudinary";
import { formatPriceRange, humanizeKey, roomSizeLabel } from "@/lib/format";

function FeaturedCard({ row }: { row: ListingSearchResult }) {
  const amenities = Object.entries(row.amenities)
    .filter(([, available]) => available)
    .map(([key]) => humanizeKey(key))
    .slice(0, 2);
  const photoUrl = row.photo_storage_key ? listingPhotoUrl(row.photo_storage_key, 700) : null;
  const roomSummary = roomSizeLabel(row);

  return (
    <li className="min-w-0">
      <Link href={`/listings/${row.id}`} className="group block h-full">
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-teal-900">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- listing photo hosts can vary in local demo data
            <img
              src={photoUrl}
              alt={row.name}
              className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.045]"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[linear-gradient(145deg,var(--teal-700),var(--teal-900))] text-white/70">
              <HomeIcon className="size-9" />
              <span className="mt-3 text-xs font-semibold">Inspection photos pending</span>
            </div>
          )}
          <div className="absolute inset-0 bg-linear-to-t from-teal-900/22 via-transparent to-transparent transition-opacity duration-300 group-hover:from-teal-900/10" />
          <VerifiedBadge size="sm" className="absolute top-3 left-3 shadow-sm" />
          <span className="absolute right-3 bottom-3 flex size-9 items-center justify-center rounded-full border border-white/30 bg-white/88 text-teal-900 opacity-0 backdrop-blur-sm transition duration-300 group-hover:translate-x-0 group-hover:opacity-100 sm:translate-x-2">
            <ArrowTopRightIcon className="size-4" />
          </span>
        </div>

        <div className="pt-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-coral-600">
            <SewingPinIcon className="size-3.5" />
            {row.street_address}
          </p>
          <h3 className="mt-2 line-clamp-1 text-lg leading-snug transition-colors duration-300 group-hover:text-teal-700">
            {row.name}
          </h3>
          <p className="mt-1.5 line-clamp-1 text-sm text-muted-foreground">
            {[roomSummary, ...amenities].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-4 flex items-end justify-between gap-3 border-t border-border pt-3">
            <p className="tabular font-display text-lg font-semibold text-foreground">
              {row.room_categories.length > 1 && (
                <span className="mr-1 text-xs font-semibold text-muted-foreground">From</span>
              )}
              {formatPriceRange(row.price_per_term_ugx, row.max_price_per_term_ugx)}
            </p>
            <span className="text-xs text-muted-foreground">per semester</span>
          </div>
        </div>
      </Link>
    </li>
  );
}

export { FeaturedCard };
