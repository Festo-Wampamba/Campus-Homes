"use client";

import { HomeIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ListingSearchResult } from "@campushomes/shared";

import { ListingsMap } from "@/components/map/listings-map";
import { formatUgx } from "@/lib/format";

export function HomeMapPreview({ listings }: { listings: ListingSearchResult[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const markers = useMemo(
    () =>
      listings.map((row) => ({
        id: row.id,
        lat: row.gps_lat,
        lon: row.gps_lon,
        label: formatUgx(row.price_per_term_ugx),
      })),
    [listings],
  );

  const selected = listings.find((row) => row.id === selectedId) ?? null;

  return (
    <div className="relative h-[26rem] overflow-hidden rounded-[1.5rem] border border-border sm:h-[30rem]">
      <ListingsMap
        markers={markers}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onBoundsChange={() => {}}
        className="h-full w-full"
      />
      {selected && (
        <Link
          href={`/listings/${selected.id}`}
          className="absolute bottom-4 left-4 z-10 flex max-w-[calc(100%-2rem)] items-center gap-3 rounded-xl bg-white p-3 pr-4 shadow-[0_16px_40px_-16px_rgba(3,33,33,0.45)] transition duration-300 hover:-translate-y-0.5"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
            <HomeIcon className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-foreground">{selected.name}</span>
            <span className="block text-xs font-semibold text-teal-700">
              {formatUgx(selected.price_per_term_ugx)} / term
            </span>
          </span>
        </Link>
      )}
    </div>
  );
}
