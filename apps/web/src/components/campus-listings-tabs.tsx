"use client";

import { ArrowRightIcon, HomeIcon } from "@radix-ui/react-icons";
import type { Campus, ListingSearchResult } from "@campushomes/shared";
import Link from "next/link";
import { useMemo, useState } from "react";

import { FeaturedCard } from "@/components/featured-card";
import { CAMPUS_LOCATIONS } from "@/lib/campuses";
import { cn } from "@/lib/utils";

const CAMPUSES = Object.values(CAMPUS_LOCATIONS);

export function CampusListingsTabs({
  campuses,
  listings,
}: {
  campuses: Campus[];
  listings: ListingSearchResult[];
}) {
  const campusByCode = new Map(campuses.map((campus) => [campus.university, campus]));
  const [active, setActive] = useState<string>("all");

  const grouped = useMemo(() => {
    const rows = new Map<string, ListingSearchResult[]>();
    for (const listing of listings) {
      rows.set(listing.university, [...(rows.get(listing.university) ?? []), listing]);
    }
    return rows;
  }, [listings]);

  const visible = (active === "all" ? listings : (grouped.get(active) ?? [])).slice(0, 6);
  const searchHref = active === "all" ? "/search" : `/search?campus=${active}`;

  return (
    <div>
      <div className="scrollbar-hide flex gap-2 overflow-x-auto border-b border-border pb-4" aria-label="Filter by university">
        <FilterButton active={active === "all"} onClick={() => setActive("all")}>
          All universities
        </FilterButton>
        {CAMPUSES.map((campus) => {
          const count = campusByCode.get(campus.code)?.hostel_count ?? grouped.get(campus.code)?.length ?? 0;
          return (
            <FilterButton
              key={campus.code}
              active={active === campus.code}
              onClick={() => setActive(campus.code)}
            >
              {campus.code}
              {count > 0 && <span className="ml-1 opacity-65">{count}</span>}
            </FilterButton>
          );
        })}
      </div>

      {visible.length > 0 ? (
        <ul className="mt-8 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((listing) => (
            <FeaturedCard key={listing.id} row={listing} />
          ))}
        </ul>
      ) : (
        <div className="mt-8 grid overflow-hidden rounded-[1.25rem] border border-border bg-teal-50 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="p-7 sm:p-9">
            <span className="flex size-11 items-center justify-center rounded-xl bg-white text-teal-700 shadow-xs">
              <HomeIcon className="size-5" />
            </span>
            <h3 className="mt-5 text-xl">Fresh inspections are in progress.</h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              No filler listings are shown here. New hostels appear as soon as an inspector confirms every required check.
            </p>
          </div>
          <Link
            href={searchHref}
            className="group m-5 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-teal-900 px-5 text-sm font-bold text-white transition duration-300 hover:bg-teal-700 active:scale-[0.98] sm:m-8"
          >
            Open the live map
            <ArrowRightIcon className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </div>
      )}

      {visible.length > 0 && (
        <div className="mt-9 flex justify-end">
          <Link href={searchHref} className="text-link group">
            See all on the map
            <ArrowRightIcon className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </div>
      )}
    </div>
  );
}

function FilterButton({
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
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center rounded-full border px-4 text-sm font-bold transition duration-300 active:scale-[0.98]",
        active
          ? "border-teal-900 bg-teal-900 text-white"
          : "border-border bg-background text-muted-foreground hover:border-teal-700 hover:text-teal-700",
      )}
    >
      {children}
    </button>
  );
}
