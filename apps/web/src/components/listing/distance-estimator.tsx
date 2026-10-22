"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { listingSearchPageResponseSchema, type University } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { MapFallbackBoundary } from "@/components/map/map-fallback-boundary";
import { api } from "@/lib/api";
import { discoveryApiParams } from "@/lib/discovery";
import { CAMPUS_LOCATIONS, ENABLED_CAMPUSES } from "@/lib/campuses";
import { formatDistance, haversineDistanceMeters, validCoordinates, type CoordinatePair } from "@/lib/distance";

const DistanceMap = dynamic(
  () => import("@/components/map/listings-map").then((module) => module.ListingsMap),
  { ssr: false, loading: () => <div className="h-full animate-pulse bg-muted" aria-label="Loading map" /> },
);

export type DistanceHostel = {
  id: string;
  name: string;
  lat: number | null | undefined;
  lon: number | null | undefined;
};

type Choice = { kind: "current" | "hostel"; point: DistanceHostel };
type DestinationKind = "campus" | "hostel";

function asChoiceHostel(row: { id: string; name: string; gps_lat: number; gps_lon: number }): DistanceHostel {
  return { id: row.id, name: row.name, lat: row.gps_lat, lon: row.gps_lon };
}

function uniqueHostels(items: DistanceHostel[]): DistanceHostel[] {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id)));
}

function endpointLabel(choice: Choice | null, campusName?: string): string {
  return choice?.point.name ?? campusName ?? "Selected destination";
}

export function DistanceEstimator({
  currentHostel,
  studentUniversity,
}: {
  currentHostel: DistanceHostel;
  studentUniversity?: University | null;
}) {
  const firstCampus = ENABLED_CAMPUSES[0];
  const profileCampus = studentUniversity
    ? ENABLED_CAMPUSES.find((item) => item.code === studentUniversity)
    : undefined;
  const [origin, setOrigin] = useState<Choice>({ kind: "current", point: currentHostel });
  const [destinationKind, setDestinationKind] = useState<DestinationKind>("campus");
  const [campusCode, setCampusCode] = useState<University>((profileCampus ?? firstCampus).code);
  const [destinationHostel, setDestinationHostel] = useState<DistanceHostel | null>(null);
  const [hostelSearch, setHostelSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [showMap, setShowMap] = useState(false);

  const query = useInfiniteQuery({
    queryKey: ["distance-hostels", hostelSearch.trim()],
    initialPageParam: 1,
    enabled: true,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ campus: firstCampus.code, q: hostelSearch.trim() });
      return listingSearchPageResponseSchema.parse(
        await api(`/listings/search-page?${discoveryApiParams(params, pageParam)}`),
      );
    },
    getNextPageParam: (page) => (page.hasMore ? page.page + 1 : undefined),
  });

  const publicHostels = useMemo(() => {
    const results = query.data?.pages.flatMap((page) => page.items).map(asChoiceHostel) ?? [];
    return uniqueHostels(results.filter((hostel) => hostel.id !== currentHostel.id));
  }, [currentHostel.id, query.data]);
  const hostelOptions = useMemo(
    () => uniqueHostels([currentHostel, ...publicHostels, origin.point, ...(destinationHostel ? [destinationHostel] : [])]),
    [currentHostel, destinationHostel, origin.point, publicHostels],
  );

  const campus = ENABLED_CAMPUSES.find((item) => item.code === campusCode) ?? firstCampus;
  const destinationPoint: CoordinatePair | null =
    destinationKind === "campus" ? { lat: campus.lat, lon: campus.lon } : destinationHostel;
  const fromCoordinates = validCoordinates(origin.point);
  const toCoordinates = validCoordinates(destinationPoint);
  const sameHostel = destinationKind === "hostel" && destinationHostel?.id === origin.point.id;
  const distance = sameHostel ? null : haversineDistanceMeters(fromCoordinates, toCoordinates);
  const formattedDistance = formatDistance(distance);
  const unsupportedProfileCampus = studentUniversity && !CAMPUS_LOCATIONS[studentUniversity];

  function chooseOrigin(id: string) {
    const point = hostelOptions.find((hostel) => hostel.id === id);
    if (!point) return;
    setOrigin({ kind: point.id === currentHostel.id ? "current" : "hostel", point });
  }

  const mapMarkers = fromCoordinates && toCoordinates && !sameHostel
    ? [
        { id: `distance-from-${origin.point.id}`, lat: fromCoordinates.lat, lon: fromCoordinates.lon, label: endpointLabel(origin), displayLabel: "From" },
        {
          id: `distance-to-${destinationKind === "campus" ? campus.code : destinationHostel?.id}`,
          lat: toCoordinates.lat,
          lon: toCoordinates.lon,
          label: destinationKind === "campus" ? campus.name : destinationHostel?.name ?? "Destination",
          displayLabel: "To",
        },
      ]
    : [];

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="distance-estimator-heading">
      <div>
        <h2 id="distance-estimator-heading" className="font-display text-2xl font-semibold">Distance estimator</h2>
        <p className="mt-2 text-sm text-muted-foreground">Compare published hostel locations with a supported university campus or another hostel.</p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold" htmlFor="distance-origin">
          From
          <select
            id="distance-origin"
            value={origin.point.id}
            onChange={(event) => chooseOrigin(event.target.value)}
            className="mt-1.5 min-h-11 w-full rounded-md border border-border bg-background px-3 text-base font-normal text-foreground"
          >
            {hostelOptions.map((hostel) => (
              <option key={hostel.id} value={hostel.id} disabled={destinationKind === "hostel" && hostel.id === destinationHostel?.id}>
                {hostel.id === currentHostel.id ? `${hostel.name} (this hostel)` : hostel.name}
                {!validCoordinates(hostel) ? " (coordinates unavailable)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-semibold" htmlFor="distance-destination-kind">
          To
          <select
            id="distance-destination-kind"
            value={destinationKind}
            onChange={(event) => setDestinationKind(event.target.value as DestinationKind)}
            className="mt-1.5 min-h-11 w-full rounded-md border border-border bg-background px-3 text-base font-normal text-foreground"
          >
            <option value="campus">University campus</option>
            <option value="hostel">Another published hostel</option>
          </select>
        </label>
      </div>

      {destinationKind === "campus" ? (
        <label className="mt-4 block max-w-xl text-sm font-semibold" htmlFor="distance-campus">
          Campus
          <select
            id="distance-campus"
            value={campus.code}
            onChange={(event) => setCampusCode(event.target.value as University)}
            className="mt-1.5 min-h-11 w-full rounded-md border border-border bg-background px-3 text-base font-normal text-foreground"
          >
            {ENABLED_CAMPUSES.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
          </select>
          {unsupportedProfileCampus && <span className="mt-2 block text-xs font-normal text-muted-foreground">Your profile university is not configured for distance comparisons yet. Choose from the supported campuses above.</span>}
        </label>
      ) : null}

      <div className="mt-4 space-y-3">
          <form onSubmit={event=>{event.preventDefault();setHostelSearch(searchDraft.trim());}} className="flex flex-wrap items-end gap-3"><label className="block min-w-0 flex-1 text-sm font-semibold" htmlFor="distance-hostel-search">
            Search published hostels
            <input
              id="distance-hostel-search"
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search by hostel or area"
              className="mt-1.5 min-h-11 w-full rounded-md border border-border bg-background px-3 text-base font-normal text-foreground"
            />
          </label><Button type="submit" variant="secondary">Search hostels</Button></form>
          {query.isPending && <p className="text-sm text-muted-foreground" role="status">Loading published hostels…</p>}
          {query.isError && <div className="flex flex-wrap items-center gap-3" role="alert"><p className="text-sm text-destructive">Published hostels could not be loaded.</p><Button type="button" variant="secondary" onClick={() => void query.refetch()}>Try again</Button></div>}
          {!query.isPending && !query.isError && publicHostels.length === 0 && <p className="text-sm text-muted-foreground">{hostelSearch ? "No hostels match this search. Try another hostel name or area." : "No other published hostels are available to compare yet."}</p>}
          {destinationKind === "hostel" && <label className="block text-sm font-semibold" htmlFor="distance-hostel">
            Destination hostel
            <select
              id="distance-hostel"
              value={destinationKind === "hostel" ? destinationHostel?.id ?? "" : origin.kind === "hostel" ? origin.point.id : ""}
              onChange={(event) => {
                const point = hostelOptions.find((hostel) => hostel.id === event.target.value) ?? null;
                if (destinationKind === "hostel") setDestinationHostel(point);
                else if (point) setOrigin({ kind: point.id === currentHostel.id ? "current" : "hostel", point });
              }}
              className="mt-1.5 min-h-11 w-full rounded-md border border-border bg-background px-3 text-base font-normal text-foreground"
            >
              <option value="">Choose a published hostel</option>
              {hostelOptions.map((hostel) => (
                <option key={hostel.id} value={hostel.id} disabled={hostel.id === origin.point.id}>
                  {hostel.id === currentHostel.id ? `${hostel.name} (this hostel)` : hostel.name}
                  {!validCoordinates(hostel) ? " (coordinates unavailable)" : ""}
                </option>
              ))}
            </select>
          </label>}
          {query.hasNextPage && <Button type="button" variant="secondary" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "Loading more…" : "Load more hostels"}</Button>}
        </div>

      {sameHostel && <p className="mt-4 text-sm text-destructive" role="alert">Choose two different hostels to compare.</p>}
      {!sameHostel && !formattedDistance && <p className="mt-4 text-sm text-muted-foreground">{destinationKind === "hostel" && !destinationHostel ? "Choose a destination hostel to calculate the distance." : "Distance unavailable because one endpoint has no verified coordinates."}</p>}
      {formattedDistance && (
        <div className="mt-5 rounded-xl bg-muted p-4" aria-live="polite">
          <p className="text-sm text-muted-foreground">{endpointLabel(origin)} to {destinationKind === "campus" ? campus.name : destinationHostel?.name}</p>
          <p className="mt-1 font-display text-3xl font-semibold tabular">{formattedDistance.kilometres} km <span className="text-lg font-normal text-muted-foreground">({formattedDistance.metres} m)</span></p>
          <p className="mt-1 text-sm font-semibold text-foreground">Approximate straight-line distance</p>
          <p className="mt-1 text-xs text-muted-foreground">This estimate uses published map coordinates. It is not a route or travel-time estimate.</p>
        </div>
      )}

      {mapMarkers.length > 0 && (
        <div className="mt-5">
          <Button type="button" variant="secondary" aria-expanded={showMap} aria-controls="distance-comparison-map" onClick={() => setShowMap((open) => !open)}>
            {showMap ? "Hide comparison map" : "Show comparison map"}
          </Button>
          {showMap && <div id="distance-comparison-map" className="mt-3 h-64 overflow-hidden rounded-xl border border-border bg-muted" aria-label="Distance endpoints map">
            <MapFallbackBoundary>
              <DistanceMap className="h-full" markers={mapMarkers} selectedId={null} onSelect={() => {}} onBoundsChange={() => {}} fitToMarkers initialCenter={[fromCoordinates!.lon, fromCoordinates!.lat]} />
            </MapFallbackBoundary>
          </div>}
        </div>
      )}
    </section>
  );
}
