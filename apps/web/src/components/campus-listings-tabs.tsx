"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Building2 } from "lucide-react";
import Link from "next/link";

import type { Campus, ListingSearchResult } from "@campushomes/shared";

import { CAMPUS_LOCATIONS } from "@/lib/campuses";
import { cn } from "@/lib/utils";
import { FeaturedCard } from "@/components/featured-card";

const CAMPUSES = Object.values(CAMPUS_LOCATIONS);

// Nearest-campus-by-distance, not a real catchment boundary — search results
// have no campus field to filter on directly (they're bounding-box results
// across the whole launch catchment), and at this scale (a few km apart,
// inside one city) squared distance between plain lat/lon is close enough to
// sort listings under the right tab without pulling in a geo library.
export function nearestCampusCode(lat: number, lon: number): string | null {
  let best: { code: string; dist: number } | null = null;
  for (const campus of CAMPUSES) {
    const dLat = lat - campus.lat;
    const dLon = lon - campus.lon;
    const dist = dLat * dLat + dLon * dLon;
    if (!best || dist < best.dist) best = { code: campus.code, dist };
  }
  return best?.code ?? null;
}

export function CampusListingsTabs({
  campuses,
  listings,
}: {
  campuses: Campus[];
  listings: ListingSearchResult[];
}) {
  const campusByCode = new Map(campuses.map((c) => [c.university, c]));
  const [active, setActive] = useState<string>("all");

  const grouped = useMemo(() => {
    const map = new Map<string, ListingSearchResult[]>();
    for (const row of listings) {
      const code = nearestCampusCode(row.gps_lat, row.gps_lon);
      if (!code) continue;
      map.set(code, [...(map.get(code) ?? []), row]);
    }
    return map;
  }, [listings]);

  const visible = (active === "all" ? listings : (grouped.get(active) ?? [])).slice(0, 6);

  return (
    <div>
      <div className="flex flex-wrap gap-2 border-b border-border pb-4" role="tablist" aria-label="Filter by university">
        <TabButton active={active === "all"} onClick={() => setActive("all")}>
          All universities
        </TabButton>
        {CAMPUSES.map((campus) => {
          const count = campusByCode.get(campus.code)?.hostel_count ?? grouped.get(campus.code)?.length ?? 0;
          return (
            <TabButton key={campus.code} active={active === campus.code} onClick={() => setActive(campus.code)}>
              {campus.code}
              {count > 0 && <span className="ml-1 text-muted-foreground">({count})</span>}
            </TabButton>
          );
        })}
      </div>

      {visible.length > 0 ? (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((row) => (
            <FeaturedCard key={row.id} row={row} />
          ))}
        </ul>
      ) : (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-14 text-center">
          <Building2 aria-hidden className="size-8 text-muted-foreground" />
          <p className="max-w-sm text-sm text-muted-foreground">
            New verified hostels are going live as our inspectors confirm
            them. Check the search map — new listings appear there first.
          </p>
        </div>
      )}

      <div className="mt-8 flex justify-end">
        <Link
          href={active === "all" ? "/search" : `/search?campus=${active}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 transition-colors hover:text-teal-900"
        >
          See all on the map
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold transition-colors duration-150",
        active
          ? "bg-teal-600 text-white"
          : "bg-muted text-muted-foreground hover:bg-teal-50 hover:text-teal-700",
      )}
    >
      {children}
    </button>
  );
}
