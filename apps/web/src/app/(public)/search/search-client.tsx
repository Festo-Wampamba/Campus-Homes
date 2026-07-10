"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { MapPin, RefreshCw } from "lucide-react";
import {
  listingSearchResultSchema,
  type ListingSearchResult,
} from "@campushomes/shared";

import { api } from "@/lib/api";
import { formatUgx, humanizeKey } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import {
  ListingsMap,
  type MapBounds,
} from "@/components/map/listings-map";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { VerifiedBadge } from "@/components/verified-badge";

const searchResponse = listingSearchResultSchema.array();

// Round so panning a few metres doesn't bust the query cache key
function roundBounds(b: MapBounds): MapBounds {
  const r = (n: number) => Math.round(n * 1e4) / 1e4;
  return { minLat: r(b.minLat), minLon: r(b.minLon), maxLat: r(b.maxLat), maxLon: r(b.maxLon) };
}

export function SearchClient() {
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["listings-search", bounds],
    enabled: bounds !== null,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const b = bounds!;
      const qs = new URLSearchParams({
        minLat: String(b.minLat),
        minLon: String(b.minLon),
        maxLat: String(b.maxLat),
        maxLon: String(b.maxLon),
        limit: "50",
      });
      return searchResponse.parse(await api<unknown>(`/listings/search?${qs}`));
    },
  });

  const markers = useMemo(
    () =>
      (data ?? []).map((row) => ({
        id: row.id,
        lat: row.gps_lat,
        lon: row.gps_lon,
        label: formatUgx(row.price_per_term_ugx),
      })),
    [data],
  );

  function selectFromMap(id: string) {
    setSelectedId(id);
    cardRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,26rem)_1fr]">
      <ListingsMap
        markers={markers}
        selectedId={selectedId}
        onSelect={selectFromMap}
        onBoundsChange={(b) => setBounds(roundBounds(b))}
        className="h-[45vh] w-full lg:order-2 lg:h-[calc(100vh-3.5rem)] lg:sticky lg:top-14"
      />
      <section
        aria-label="Search results"
        className="flex flex-col gap-3 px-4 py-5 sm:px-6 lg:order-1 lg:h-[calc(100vh-3.5rem)] lg:overflow-y-auto"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-xl">Verified places here</h1>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {data ? `${data.length} found` : "Searching…"}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Move the map to search a different area. Every result passed a
          physical inspection.
        </p>

        {isPending && bounds !== null && (
          <div className="flex flex-col gap-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        )}

        {isError && (
          <EmptyState
            icon={RefreshCw}
            title="Search didn't load"
            body="Check your connection and try again — your map position is kept."
            action={
              <Button variant="secondary" onClick={() => refetch()}>
                Try again
              </Button>
            }
          />
        )}

        {data && data.length === 0 && (
          <EmptyState
            icon={MapPin}
            title="No verified places in this area yet"
            body="Pan or zoom the map toward your campus — new hostels go live as our inspectors verify them."
          />
        )}

        {data?.map((row) => (
          <ResultCard
            key={row.id}
            row={row}
            selected={row.id === selectedId}
            onHover={() => setSelectedId(row.id)}
            ref={(el) => {
              if (el) cardRefs.current.set(row.id, el);
              else cardRefs.current.delete(row.id);
            }}
          />
        ))}
      </section>
    </div>
  );
}

function ResultCard({
  row,
  selected,
  onHover,
  ref,
}: {
  row: ListingSearchResult;
  selected: boolean;
  onHover: () => void;
  ref: React.Ref<HTMLElement>;
}) {
  const amenities = Object.entries(row.amenities)
    .filter(([, has]) => has)
    .map(([key]) => humanizeKey(key))
    .slice(0, 3);

  return (
    <article
      ref={ref}
      onMouseEnter={onHover}
      className={cn(
        "rounded-lg border border-border bg-card p-4 shadow-xs transition-shadow duration-150 hover:shadow-md",
        selected && "border-teal-600 ring-1 ring-teal-600",
      )}
    >
      <Link href={`/listings/${row.id}`} className="group block">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg leading-snug group-hover:text-teal-700">
            {row.name}
          </h3>
          <VerifiedBadge size="sm" className="shrink-0" />
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{row.street_address}</p>
        {row.description && (
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
            {row.description}
          </p>
        )}
        {amenities.length > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            {amenities.join(" · ")}
          </p>
        )}
        <p className="tabular mt-3 font-display text-lg font-semibold text-foreground">
          {formatUgx(row.price_per_term_ugx)}
          <span className="text-sm font-normal text-muted-foreground"> / term</span>
        </p>
      </Link>
    </article>
  );
}
