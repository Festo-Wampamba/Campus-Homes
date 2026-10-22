"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  listingReviewsPageSchema,
  listingSearchResultSchema,
  type ListingDetailResponse,
  type University,
} from "@campushomes/shared";
import { z } from "zod";
import { Flag, MapPin, Star } from "lucide-react";

import { MapFallbackBoundary } from "@/components/map/map-fallback-boundary";
import { api } from "@/lib/api";
import { approximateCampusDistance } from "@/lib/discovery";
import { CAMPUS_LOCATIONS, ENABLED_CAMPUSES, UGANDA_BOUNDS } from "@/lib/campuses";
import { formatUgx, GENDER_ARRANGEMENT_LABELS } from "@/lib/format";
import { RoomCategoryList, groupByCategory, roomDisplayLabel, type CategoryGroup } from "@/components/room-category-list";
import { ReserveButton } from "@/components/reserve-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { AskLandlordDialog } from "@/components/listing/ask-landlord-dialog";
import { ListingShare } from "@/components/listing/listing-share";
import { LandlordSummary } from "@/components/listing/landlord-summary";
import { HouseRuleList } from "@/components/listing/house-rule-list";
import { AmenityList } from "@/components/listing/amenity-list";
import { DistanceEstimator } from "@/components/listing/distance-estimator";
import { InquirySafetyTips } from "@/components/listing/inquiry-safety-tips";
import { HostelCard } from "@/components/hostel-card";

const ListingsMap = dynamic(
  () => import("@/components/map/listings-map").then((module) => module.ListingsMap),
  { ssr: false },
);

type DescriptionBlock = {
  kind: "paragraph" | "unordered" | "ordered";
  items: string[];
};

const unorderedItem = /^(?:[-*•])\s+(.+)$/;
const orderedItem = /^\d+[.)]\s+(.+)$/;

/**
 * Turn the landlord's plain text snapshot into paragraphs and simple lists.
 * React renders every item as text, so listing content cannot inject markup.
 */
export function descriptionBlocks(description: string | null): DescriptionBlock[] {
  if (!description?.trim()) return [];

  const blocks: DescriptionBlock[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      blocks.push({ kind: "paragraph", items: [paragraphLines.join(" ")] });
      paragraphLines = [];
    }
  };

  for (const rawLine of description.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      continue;
    }

    const unordered = line.match(unorderedItem);
    const ordered = line.match(orderedItem);
    if (unordered || ordered) {
      flushParagraph();
      const kind = unordered ? "unordered" : "ordered";
      const item = (unordered?.[1] ?? ordered?.[1] ?? "").trim();
      const last = blocks[blocks.length - 1];
      if (last?.kind === kind) last.items.push(item);
      else blocks.push({ kind, items: [item] });
      continue;
    }

    paragraphLines.push(line);
  }
  flushParagraph();
  return blocks;
}

function Description({ description }: { description: string | null }) {
  const blocks = descriptionBlocks(description);
  const [expanded, setExpanded] = useState(false);
  const hasMore = blocks.length > 1 || blocks.some((block) => block.items.some((item) => item.length > 420));
  const visibleBlocks = expanded || !hasMore ? blocks : blocks.slice(0, 1);

  return (
    <section aria-labelledby="about-heading">
      <h2 id="about-heading" className="text-2xl">About this hostel</h2>
      {blocks.length ? (
        <div className="mt-4 max-w-prose space-y-4 leading-relaxed text-muted-foreground">
          {visibleBlocks.map((block, index) => {
            const items = !expanded && hasMore && index === 0 && block.kind !== "paragraph" ? block.items.slice(0, 3) : block.items;
            if (block.kind === "unordered") {
              return (
                <ul key={`unordered-${index}`} className="list-disc space-y-2 pl-5">
                  {items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{item}</li>)}
                </ul>
              );
            }
            if (block.kind === "ordered") {
              return (
                <ol key={`ordered-${index}`} className="list-decimal space-y-2 pl-5">
                  {items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{item}</li>)}
                </ol>
              );
            }
            return (
              <p key={`paragraph-${index}`} className={!expanded && hasMore && index === 0 ? "line-clamp-5" : undefined}>
                {block.items[0]}
              </p>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 max-w-prose leading-relaxed text-muted-foreground">
          A detailed description has not been provided. Explore the inspected photos and room options below.
        </p>
      )}
      {hasMore && (
        <Button type="button" variant="link" className="mt-3 px-0" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          {expanded ? "Show less" : "Read full description"}
        </Button>
      )}
    </section>
  );
}

function ListingUtilityActions({ propertyName, reportHref }: { propertyName: string; reportHref: string }) {
  return (
    <div className="space-y-2" aria-label="Listing actions">
      <ListingShare propertyName={propertyName} />
      <Link href={reportHref} className={buttonVariants({ variant: "link", className: "min-h-11 px-0" })}>
        <Flag aria-hidden />
        Report listing
      </Link>
    </div>
  );
}

export function ListingExperience({
  detail,
  canReserve,
  signedIn,
  needsProfile,
  heldBeds,
  savedIds,
  identity,
  studentUniversity,
}: {
  detail: ListingDetailResponse;
  canReserve: boolean;
  signedIn: boolean;
  needsProfile: boolean;
  heldBeds: [string, "reserved" | "booked"][];
  savedIds: string[];
  identity?: ReactNode;
  studentUniversity?: University | null;
}) {
  const params = useSearchParams();
  const { property, listing, version, units, availability, photos, unitPhotos } = detail;
  const beds = new Map<string, { id: string; available: boolean }[]>();
  for (const bed of availability) beds.set(bed.unit_id, [...(beds.get(bed.unit_id) ?? []), bed]);
  const groups = groupByCategory(units, beds, unitPhotos, photos, new Map(heldBeds));
  const [selectedKey, setSelectedKey] = useState<string | null>(() => params.get("room"));
  const selected = groups.find((group) => group.key === selectedKey) ?? null;
  const availableGroups = groups.filter((group) => group.availableCount > 0);
  const minPrice = availableGroups.length ? Math.min(...availableGroups.map((group) => group.pricePerTermUgx)) : null;
  const amenities = Object.entries(version.amenities).filter(([, has]) => has).map(([key]) => key);

  const campus = (studentUniversity ? CAMPUS_LOCATIONS[studentUniversity] : undefined) ?? ENABLED_CAMPUSES[0];
  const distance = campus ? approximateCampusDistance(property.gps_lat, property.gps_lon, campus.code) : null;
  const coordinatesAvailable = property.gps_lat != null && property.gps_lon != null && Number.isFinite(property.gps_lat) && Number.isFinite(property.gps_lon);
  const supportHref = `/contact?${new URLSearchParams({ listingId: listing.id, subject: `Report listing: ${property.name}` })}`;
  const reportHref = signedIn ? supportHref : `/sign-in?next=${encodeURIComponent(supportHref)}`;

  const reviewQuery = useInfiniteQuery({
    queryKey: ["listing-reviews", listing.id],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => listingReviewsPageSchema.parse(await api(`/listings/${listing.id}/reviews?page=${pageParam}&limit=10`)),
    getNextPageParam: (page) => page.hasMore ? page.page + 1 : undefined,
  });
  const related = useQuery({
    queryKey: ["related-listings", listing.id],
    queryFn: async () => {
      const search = new URLSearchParams({ ...Object.fromEntries(Object.entries(UGANDA_BOUNDS).map(([key, value]) => [key, String(value)])), university: "MUK", limit: "5" });
      return z.array(listingSearchResultSchema).parse(await api(`/listings/search?${search}`)).filter((row) => row.id !== listing.id).slice(0, 3);
    },
  });

  function select(group: CategoryGroup) {
    setSelectedKey(group.key);
    const url = new URL(window.location.href);
    url.searchParams.set("room", group.key);
    window.history.replaceState(null, "", url);
  }

  function signIn(intent: string) {
    const next = new URLSearchParams();
    if (selected) next.set("room", selected.key);
    next.set("intent", intent);
    return `/sign-in?next=${encodeURIComponent(`/listings/${listing.id}?${next}`)}`;
  }

  const roomLabel = selected ? roomDisplayLabel(selected) : "Choose your room";
  function action(compact = false) {
    const primaryClass = buttonVariants({className: compact ? undefined : "w-full min-h-12"});
    return (
      <div className={compact ? "flex items-center justify-between gap-3" : "space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm"}>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{selected ? `${roomLabel}, ${selected.selfContained ? "private bathroom" : "shared bathroom"}` : minPrice !== null ? "Available rooms from" : "Availability"}</p>
          <p className="font-display text-xl font-semibold sm:text-2xl">{selected ? formatUgx(selected.pricePerTermUgx) : minPrice !== null ? formatUgx(minPrice) : "Currently unavailable"}</p>
          {(selected || minPrice !== null) && <p className="text-xs text-muted-foreground">per bed, per semester</p>}
        </div>
        <div className={compact ? "shrink-0" : "space-y-3"}>
          {!selected ? <a className={primaryClass} href="#room-choices">Choose a room</a>
            : selected.myStatus ? <Link href="/reservations" className={primaryClass}>View your reservation</Link>
              : !selected.firstAvailableBedId ? <Button disabled>Currently unavailable</Button>
                : canReserve ? <ReserveButton bedId={selected.firstAvailableBedId} listingId={listing.id} needsProfile={needsProfile} propertyName={property.name} roomLabel={roomLabel} priceUgx={selected.pricePerTermUgx} depositUgx={selected.depositUgx} />
                  : !signedIn ? <Link className={primaryClass} href={signIn("reserve")}>Sign in to reserve</Link> : <p className="text-sm">A student account is required.</p>}
          {!compact && <p className="text-sm text-muted-foreground">Free reservation. No payment is taken on CampusHomes.</p>}
        </div>
        {!compact && selected && <p className="border-t border-border pt-3 text-sm text-muted-foreground">Deposit: {selected.depositUgx == null ? "unstated; confirm with the landlord." : formatUgx(selected.depositUgx)}</p>}
      </div>
    );
  }

  const sidebarQuestions = canReserve ? (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
      <a href="#questions" className={buttonVariants({ variant: "secondary" })}>Request a viewing</a>
      <a href="#questions" className={buttonVariants({ variant: "secondary" })}>Ask a question</a>
    </div>
  ) : !signedIn ? (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
      <Link href={signIn("viewing")} className={buttonVariants({ variant: "secondary" })}>Sign in to request a viewing</Link>
      <Link href={signIn("question")} className={buttonVariants({ variant: "secondary" })}>Sign in to ask a question</Link>
    </div>
  ) : (
    <Link href="/contact" className={buttonVariants({ variant: "secondary" })}>Contact CampusHomes support</Link>
  );

  const mapMarkers = coordinatesAvailable && campus ? [
    { id: listing.id, lat: property.gps_lat!, lon: property.gps_lon!, label: property.name },
    { id: `campus-${campus.code}`, lat: campus.lat, lon: campus.lon, label: campus.name, kind: "campus" as const },
  ] : [];

  return (
    <>
      <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-10">
          {identity && <div>{identity}</div>}
          {!!reviewQuery.data?.pages[0].total && <a href="#resident-reviews" className="flex min-h-11 items-center gap-2 text-sm font-semibold"><Star aria-hidden className="size-4" />{reviewQuery.data.pages[0].average?.toFixed(1)} / 5 · {reviewQuery.data.pages[0].total} resident reviews</a>}

          <Description description={version.description} />

          <section id="location" className="scroll-mt-24" aria-labelledby="location-heading">
            <h2 id="location-heading" className="text-2xl">Location</h2>
            <p className="mt-3 flex items-start gap-2 text-muted-foreground"><MapPin aria-hidden className="size-5 shrink-0" />{property.street_address}</p>
            {distance !== null ? <p className="mt-2 text-sm text-muted-foreground">Approximately {(distance / 1000).toFixed(1)} km in a straight line from {campus?.name ?? "the selected campus"}. Road distance can differ.</p> : <p className="mt-2 text-sm text-muted-foreground">Campus distance is unavailable for the selected campus.</p>}
            <div className="mt-4 h-80 overflow-hidden rounded-2xl border border-border bg-muted" aria-label={`Map showing ${property.name} and ${campus?.name ?? "the selected campus"}`}>
              {mapMarkers.length ? <MapFallbackBoundary><ListingsMap className="h-full" markers={mapMarkers} selectedId={listing.id} onSelect={() => {}} onBoundsChange={() => {}} fitToMarkers initialCenter={[property.gps_lon!, property.gps_lat!]} /></MapFallbackBoundary> : <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">A map is unavailable because this property has no verified coordinates.</div>}
            </div>
          </section>

          <section id="room-choices" className="scroll-mt-24" aria-labelledby="room-choices-heading">
            <h2 id="room-choices-heading" className="text-2xl">Choose your room</h2>
            <p className="mt-3 text-muted-foreground">{property.gender_arrangement ? `${GENDER_ARRANGEMENT_LABELS[property.gender_arrangement]}. ` : "Gender arrangement unstated. "}Your free reservation holds an available bed within the selected category.</p>
            <RoomCategoryList listingId={listing.id} units={units} availability={availability} photos={photos} unitPhotos={unitPhotos} propertyName={property.name} canReserve={canReserve} needsProfile={needsProfile} myLiveBeds={new Map(heldBeds)} selectedKey={selected?.key} onSelect={select} publicPresentation />
          </section>

          <DistanceEstimator currentHostel={{id:listing.id,name:property.name,lat:property.gps_lat,lon:property.gps_lon}} studentUniversity={studentUniversity}/>

          <section aria-labelledby="facilities-heading"><h2 id="facilities-heading" className="text-2xl">Amenities</h2>{amenities.length ? <AmenityList keys={amenities} /> : <p className="mt-3 text-muted-foreground">Amenities have not been stated.</p>}</section>
          <section aria-labelledby="rules-heading"><h2 id="rules-heading" className="text-2xl">House rules</h2>{property.house_rules?.length ? <HouseRuleList rules={property.house_rules} /> : <p className="mt-3 text-muted-foreground">House rules have not been stated. Ask the landlord before reserving.</p>}</section>
          <InquirySafetyTips reportHref={reportHref}/>
          <section className="rounded-2xl bg-muted p-6" aria-labelledby="inspection-heading"><h2 id="inspection-heading" className="text-2xl">Physically inspected</h2><p className="mt-3 text-muted-foreground">Inspected {listing.verifiedAt ? new Date(listing.verifiedAt).toLocaleDateString("en-UG", { day: "numeric", month: "long", year: "numeric" }) : "on a date not provided"}. Conditions can change after inspection. Review the photos and arrange a viewing before paying.</p><Link href="/safety" className="mt-3 inline-block font-semibold underline">What our inspection covers</Link></section>
          <section aria-labelledby="costs-heading"><h2 id="costs-heading" className="text-2xl">Costs and charges</h2><dl className="mt-4 space-y-3"><div><dt className="font-semibold">Semester rent and deposit</dt><dd className="text-muted-foreground">Shown for each room category above. Unstated deposits need confirmation.</dd></div><div><dt className="font-semibold">Landlord booking fee</dt><dd className="text-muted-foreground">{property.booking_fee_percent == null ? "Unstated" : `${property.booking_fee_percent}% of semester rent`}</dd></div><div><dt className="font-semibold">Advance rent</dt><dd className="text-muted-foreground">{property.advance_rent_required ? "Required; confirm amount and payment timing with the landlord." : "Confirm requirements and payment timing with the landlord."}</dd></div></dl><p className="mt-4 text-sm text-muted-foreground">A complete move-in total is unavailable until all charges and payment timing are confirmed.</p></section>
          <section id="resident-reviews" className="scroll-mt-24" aria-labelledby="reviews-heading"><h2 id="reviews-heading" className="text-2xl">Resident reviews</h2>{reviewQuery.isPending ? <p className="mt-3" role="status">Loading reviews…</p> : reviewQuery.isError ? <div className="mt-3"><p>Reviews couldn’t load.</p><Button variant="secondary" onClick={() => reviewQuery.refetch()}>Try again</Button></div> : <><p className="mt-3 flex items-center gap-2"><Star aria-hidden className="size-5" />{reviewQuery.data.pages[0].total ? `${reviewQuery.data.pages[0].average?.toFixed(1)} / 5 · ${reviewQuery.data.pages[0].total} genuine resident reviews` : "No resident reviews yet."}</p><div className="mt-4 divide-y divide-border">{reviewQuery.data.pages.flatMap((page) => page.items).map((review) => <article className="py-4" key={review.id}><p className="text-sm font-semibold">{review.overall_rating} / 5 <span className="font-normal text-muted-foreground">· {new Date(review.submitted_at).toLocaleDateString("en-UG")}</span></p><p className="mt-2 text-muted-foreground">{review.comment || "This resident left a rating without a comment."}</p></article>)}</div>{reviewQuery.hasNextPage && <Button disabled={reviewQuery.isFetchingNextPage} onClick={() => reviewQuery.fetchNextPage()}>Load more reviews</Button>}</>}</section>
          <section id="questions" className="scroll-mt-24" aria-labelledby="questions-heading"><h2 id="questions-heading" className="text-2xl">Talk to the landlord</h2><p className="mt-3 text-muted-foreground">A viewing request needs the landlord’s reply before an appointment is confirmed.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{canReserve ? <><AskLandlordDialog listingId={listing.id} propertyName={property.name} viewing /><AskLandlordDialog listingId={listing.id} propertyName={property.name} /></> : !signedIn ? <><Link className={buttonVariants({ variant: "secondary" })} href={signIn("viewing")}>Sign in to request a viewing</Link><Link className={buttonVariants({ variant: "secondary" })} href={signIn("question")}>Sign in to ask a question</Link></> : <p>Use a student account to contact this landlord.</p>}</div>{params.get("intent") && canReserve && <p className="mt-3 text-sm text-primary">Your intended action is restored. Review the room or open the request above to continue.</p>}<div className="mt-5 space-y-4 lg:hidden"><LandlordSummary landlord={detail.landlord} /><ListingUtilityActions propertyName={property.name} reportHref={reportHref} /></div></section>
        </div>
        <aside className="hidden space-y-4 lg:sticky lg:top-24 lg:block lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:overscroll-contain" aria-label="Listing actions">
          {action()}
          <section className="rounded-2xl border border-border bg-card p-4" aria-label="Questions and viewing requests">{sidebarQuestions}</section>
          <LandlordSummary landlord={detail.landlord} />
          <ListingUtilityActions propertyName={property.name} reportHref={reportHref} />
        </aside>
      </div>
      {related.data?.length ? <section className="mt-16" aria-labelledby="related-heading"><h2 id="related-heading" className="text-2xl">More available hostels</h2><div className="mt-6 grid gap-6 md:grid-cols-3">{related.data.map((row) => <HostelCard key={row.id} listing={row} canSave={canReserve} saved={savedIds.includes(row.id)} />)}</div></section> : null}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] shadow-lg lg:hidden">{action(true)}</div><div className="h-36 lg:hidden" aria-hidden />
    </>
  );
}
