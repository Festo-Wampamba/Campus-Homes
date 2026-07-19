"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, MapPin, RefreshCw, Search as SearchIcon } from "lucide-react";
import {
  listingSearchResultSchema,
  type ListingSearchResult,
  type University,
} from "@campushomes/shared";

import { api } from "@/lib/api";
import { CAMPUS_LOCATIONS } from "@/lib/campuses";
import { listingPhotoUrl } from "@/lib/cloudinary";
import { formatPriceRange, formatUgx, humanizeKey, roomSizeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import {
  ListingsMap,
  type MapBounds,
} from "@/components/map/listings-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { VerifiedBadge } from "@/components/verified-badge";

const searchResponse = listingSearchResultSchema.array();

const CAPACITY_OPTIONS = [
  { value: "", label: "Any room size" },
  { value: "1", label: "1+ person" },
  { value: "2", label: "2+ people" },
  { value: "4", label: "4+ people" },
];

// Round so panning a few metres doesn't bust the query cache key
function roundBounds(b: MapBounds): MapBounds {
  const r = (n: number) => Math.round(n * 1e4) / 1e4;
  return { minLat: r(b.minLat), minLon: r(b.minLon), maxLat: r(b.maxLat), maxLon: r(b.maxLon) };
}

export function SearchClient() {
  const searchParams = useSearchParams();
  const campus = CAMPUS_LOCATIONS[searchParams.get("campus") as University];

  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minCapacity, setMinCapacity] = useState("");

  // Debounced so typing a name doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["listings-search", bounds, debouncedQ, minPrice, maxPrice, minCapacity],
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
      if (debouncedQ) qs.set("q", debouncedQ);
      if (minPrice) qs.set("minPriceUgx", minPrice);
      if (maxPrice) qs.set("maxPriceUgx", maxPrice);
      if (minCapacity) qs.set("minCapacity", minCapacity);
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
        initialCenter={campus ? [campus.lon, campus.lat] : undefined}
      />
      <section
        aria-label="Search results"
        className="flex flex-col gap-3 px-4 py-5 sm:px-6 lg:order-1 lg:h-[calc(100vh-3.5rem)] lg:overflow-y-auto"
      >
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Home
        </Link>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-xl">
            {campus ? `Near ${campus.name}` : "Verified places here"}
          </h1>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {data ? `${data.length} found` : "Searching…"}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Move the map to search a different area. Every result passed a
          physical inspection.
        </p>

        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative flex-1 sm:min-w-40">
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by hostel name"
              aria-label="Search by hostel name"
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder="Min UGX"
              aria-label="Minimum price per semester"
              className="w-28"
            />
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="Max UGX"
              aria-label="Maximum price per semester"
              className="w-28"
            />
          </div>
          <select
            value={minCapacity}
            onChange={(e) => setMinCapacity(e.target.value)}
            aria-label="Minimum room size"
            className={cn(
              "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs transition-colors duration-150 sm:h-10 sm:w-auto",
              "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            {CAPACITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

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
  const photoUrl = row.photo_storage_key ? listingPhotoUrl(row.photo_storage_key, 300) : null;
  const rooms = roomSizeLabel(row);

  return (
    <article
      ref={ref}
      onMouseEnter={onHover}
      className={cn(
        "rounded-lg border border-border bg-card p-3 shadow-xs transition-shadow duration-150 hover:shadow-md",
        selected && "border-teal-600 ring-1 ring-teal-600",
      )}
    >
      <Link href={`/listings/${row.id}`} className="group flex gap-3">
        <div className="relative size-24 shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-teal-700 to-teal-900">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- unpredictable/hotlinked seed hosts, not worth next/image's remote-pattern allowlist churn for a thumbnail
            <img
              src={photoUrl}
              alt={row.name}
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            <Building2 aria-hidden className="absolute inset-0 m-auto size-6 text-white/70" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-lg leading-snug group-hover:text-teal-700">
              {row.name}
            </h3>
            <VerifiedBadge size="sm" className="shrink-0" />
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin aria-hidden className="size-3.5 shrink-0" />
            {row.street_address}
          </p>
          {rooms && <p className="mt-1.5 text-sm text-muted-foreground">{rooms}</p>}
          {amenities.length > 0 && (
            <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
              {amenities.join(" · ")}
            </p>
          )}
          <p className="tabular mt-1.5 font-display text-lg font-semibold text-foreground">
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
    </article>
  );
}
