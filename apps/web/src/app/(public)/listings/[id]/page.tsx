import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Phone, User } from "lucide-react";
import {
  listingDetailResponseSchema,
  type ListingDetailResponse,
} from "@campushomes/shared";

import { api, ApiError } from "@/lib/api";
import { listingPhotoUrl } from "@/lib/cloudinary";
import { formatUgx, GENDER_ARRANGEMENT_LABELS } from "@/lib/format";
import { getSavedListings } from "@/lib/saved-listings";
import { getServerSession } from "@/lib/session";
import { getStudentProfile } from "@/lib/student";
import { cn } from "@/lib/utils";
import { AmenityList } from "@/components/listing/amenity-list";
import { AskLandlordDialog } from "@/components/listing/ask-landlord-dialog";
import { ListingGallery } from "@/components/listing/listing-gallery";
import { BackButton } from "@/components/back-button";
import { RoomCategoryList } from "@/components/room-category-list";
import { SaveButton } from "@/components/save-button";
import { TrackRecentlyViewed } from "@/components/track-recently-viewed";
import { VerifiedBadge } from "@/components/verified-badge";

// Renders the version snapshot the API returns — never re-fetch live listing
// fields (FRONTEND.md §7.2); students reserve against exactly this snapshot.
// Wrapped in React's cache() so generateMetadata() and the page component
// below (which both need this) share one call per request — without it,
// every real page view hit GET /listings/:id twice, double-counting the
// listing_view pilot-funnel event (0032) logged server-side on that route.
const getDetail = cache(async (id: string): Promise<ListingDetailResponse | null> => {
  try {
    return listingDetailResponseSchema.parse(
      await api<unknown>(`/listings/${id}`, { cache: "no-store" }),
    );
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) {
      return null;
    }
    throw err;
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const id = (await params).id;
  const detail = await getDetail(id);
  if (!detail) return { title: "Listing" };
  const photo = detail.photos[0] ? listingPhotoUrl(detail.photos[0].storageKey, 1200) : null;
  const description = `Inspected student hostel${detail.property.street_address ? ` at ${detail.property.street_address}` : ""}. See rooms, prices and amenities, and reserve for free on CampusHomes.`;
  return {
    title: detail.property.name,
    description,
    alternates: { canonical: `/listings/${id}` },
    openGraph: { title: detail.property.name, description, ...(photo ? { images: [{ url: photo, alt: detail.property.name }] } : {}) },
  };
}

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const listingId = (await params).id;
  const [detail, session] = await Promise.all([getDetail(listingId), getServerSession()]);
  if (!detail) notFound();
  const isStudent = session?.user.status === "active" && session.access.workspaces.includes("student");
  const [studentProfile, savedListings] = await Promise.all([
    isStudent ? getStudentProfile() : Promise.resolve(null),
    isStudent ? getSavedListings() : Promise.resolve([]),
  ]);
  // Any signed-in student can reserve immediately — a missing `students` row
  // (university/year, required by the reservations FK) is collected inline
  // by ReserveButton's quick-registration dialog on first reserve, not as a
  // separate blocking page a new signup has to detour through first.
  const canReserve = isStudent;
  const needsProfile = isStudent && studentProfile === null;
  const isSaved = savedListings.some((row) => row.id === listingId);

  const { property, listing, version, photos, units, unitPhotos, availability, propertyMedia } = detail;
  const unitPrices = units.map((u) => u.pricePerTermUgx);
  const minPriceUgx = unitPrices.length > 0 ? Math.min(...unitPrices) : version.pricePerTermUgx;
  const maxPriceUgx = unitPrices.length > 0 ? Math.max(...unitPrices) : version.pricePerTermUgx;
  const amenityKeys = Object.entries(version.amenities)
    .filter(([, has]) => has)
    .map(([key]) => key);
  const orderedPhotos = [...photos].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder,
  );
  // Gallery-only combined list: Ops-verified inspection photos first, then
  // the landlord's own whole-property shots (property_media, 0026) — kept
  // separate from orderedPhotos itself since TrackRecentlyViewed and
  // RoomCategoryList below expect the real ListingPhoto shape, not this
  // display-only id+storageKey union.
  const galleryPhotos: { id: string; storageKey: string }[] = [
    ...orderedPhotos.map((p) => ({ id: p.id, storageKey: p.storageKey })),
    ...propertyMedia.map((m) => ({ id: m.id, storageKey: m.storage_key })),
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <TrackRecentlyViewed
        id={listingId}
        name={property.name}
        streetAddress={property.street_address}
        photoStorageKey={galleryPhotos[0]?.storageKey ?? null}
        priceUgx={minPriceUgx}
      />
      <BackButton fallbackHref="/search" label="Back" />

      <header className="mt-6 flex items-start justify-between gap-4 sm:mt-7">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="min-w-0 text-3xl leading-tight tracking-[-0.035em] sm:text-4xl">
              {property.name}
            </h1>
            <VerifiedBadge />
            {property.gender_arrangement && (
              <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                {GENDER_ARRANGEMENT_LABELS[property.gender_arrangement]}
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="text-md text-muted-foreground">{property.street_address}</p>
            {listing.verifiedAt && (
              <span className="text-xs text-muted-foreground">
                Inspected{" "}
                {new Date(listing.verifiedAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            )}
            <Link
              href="/#verified"
              className="text-xs font-semibold text-teal-700 underline-offset-4 hover:underline dark:text-teal-300"
            >
              What does Verified mean?
            </Link>
          </div>
        </div>
        {isStudent && (
          <div className="shrink-0 pt-0.5">
            <SaveButton listingId={listingId} initialSaved={isSaved} />
          </div>
        )}
      </header>

      {/* Gallery + money/custodian card sit side by side on large screens,
          starting at the same vertical position — the reservation card is
          never scrolled below the photos, same layout logic as an
          e-commerce product image + buy box. */}
      <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start xl:gap-10">
        <div>
          {/* Photos — inspector-captured (EXIF-verified) plus the
              landlord's own whole-property shots (property_media, 0026) */}
          <div className="mb-10">
            <ListingGallery photos={galleryPhotos} propertyName={property.name} />
          </div>

          {version.description && (
            <section aria-labelledby="about-heading">
              <h2 id="about-heading" className="text-xl">
                About this place
              </h2>
              <p className="mt-3 max-w-[70ch] text-md leading-relaxed text-muted-foreground">
                {version.description}
              </p>
            </section>
          )}

          {amenityKeys.length > 0 && (
            <section aria-labelledby="amenities-heading" className="mt-10">
              <h2 id="amenities-heading" className="text-xl">
                Amenities we confirmed
              </h2>
              <AmenityList keys={amenityKeys} />
            </section>
          )}

          <section aria-labelledby="units-heading" className="mt-10">
            <h2 id="units-heading" className="text-xl">
              Room types
            </h2>
            <RoomCategoryList
              listingId={listingId}
              units={units}
              availability={availability}
              photos={orderedPhotos}
              unitPhotos={unitPhotos}
              propertyName={property.name}
              canReserve={canReserve}
              needsProfile={needsProfile}
            />
          </section>

          {/* Pre-reservation channel to the landlord — separate from the
              reservation chat thread (only opens once a hold exists) and
              from /support (staff-routed, never reaches the landlord). */}
          <section aria-labelledby="ask-heading" className="mt-10 max-w-sm">
            <h2 id="ask-heading" className="text-xl">
              Have a question?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask the landlord directly, or request a viewing. No reservation needed.
            </p>
            <div className="mt-3">
              {session ? (
                <AskLandlordDialog listingId={listingId} propertyName={property.name} />
              ) : (
                <Link
                  href="/sign-in"
                  className="inline-flex h-11 w-full items-center justify-center rounded-md border border-border bg-background text-base font-semibold text-foreground shadow-xs hover:bg-muted"
                >
                  Sign in to ask a question
                </Link>
              )}
            </div>
          </section>
        </div>

        {/* Reservation panel — pinned so price + CTA are never scrolled out
            of view: a sticky sidebar on desktop, a fixed bottom bar on
            mobile (there's no room beside the content there). */}
        <aside className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
          <MoneyCard
            session={session}
            canReserve={canReserve}
            minPriceUgx={minPriceUgx}
            maxPriceUgx={maxPriceUgx}
            bookingFeePercent={property.booking_fee_percent}
            advanceRentRequired={property.advance_rent_required}
            custodianName={property.custodian_name}
            custodianPhone={property.custodian_phone}
          />
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/96 p-3 shadow-[0_-12px_32px_-18px_rgba(0,47,47,0.35)] backdrop-blur-xl lg:hidden">
        <MoneyCard
          session={session}
          canReserve={canReserve}
          minPriceUgx={minPriceUgx}
          maxPriceUgx={maxPriceUgx}
          compact
        />
      </div>
      {/* Clears the fixed mobile bar so it never covers the last room row. */}
      <div className="h-28 lg:hidden" aria-hidden />
    </div>
  );
}

function MoneyCard({
  session,
  canReserve,
  minPriceUgx,
  maxPriceUgx,
  bookingFeePercent,
  advanceRentRequired,
  custodianName,
  custodianPhone,
  compact = false,
}: {
  session: Awaited<ReturnType<typeof getServerSession>>;
  canReserve: boolean;
  minPriceUgx: number;
  maxPriceUgx: number;
  bookingFeePercent?: number | null;
  advanceRentRequired?: boolean;
  custodianName?: string | null;
  custodianPhone?: string | null;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        compact
          ? "flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
          : "rounded-2xl border border-border bg-card p-5 shadow-[0_22px_50px_-32px_rgba(0,47,47,0.35)] sm:p-6",
      )}
    >
      <div className={cn("min-w-0", compact && "flex-1")}>
        {minPriceUgx !== maxPriceUgx && (
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">From</p>
        )}
        <p
          className={cn(
            "tabular font-display font-semibold leading-tight text-foreground",
            compact ? "text-lg" : "mt-0.5 text-[1.75rem]",
          )}
        >
          {formatUgx(minPriceUgx)}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {minPriceUgx !== maxPriceUgx && !compact && <>Up to {formatUgx(maxPriceUgx)} · </>}
          per bed / semester
        </p>
        {!compact && (
          <p className="mt-2 text-sm text-muted-foreground">
            Reserve any available room. It&apos;s free to hold your spot.
          </p>
        )}
      </div>
      {!session && (
        <Link
          href="/sign-in"
          className={cn(
            "inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 font-semibold text-primary-foreground shadow-xs transition duration-300 hover:bg-teal-700 active:scale-[0.98]",
            compact ? "shrink-0" : "mt-4 w-full",
          )}
        >
          Sign in to reserve
        </Link>
      )}
      {canReserve && (
        <p
          className={cn(
            "font-semibold leading-snug text-foreground",
            compact ? "max-w-48 shrink-0 text-right text-xs sm:text-sm" : "mt-4 text-sm",
          )}
        >
          Select an available room{compact ? "" : " below to reserve."}
        </p>
      )}
      {!compact && (
        <p className="mt-3 text-xs text-muted-foreground">
          Rent and tenancy terms are agreed directly with the landlord.
        </p>
      )}
      {!compact && (bookingFeePercent != null || advanceRentRequired) && (
        <div className="mt-3 rounded-lg bg-muted p-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Other charges
          </p>
          <ul className="mt-1.5 space-y-1 text-xs text-foreground">
            {bookingFeePercent != null && (
              <li>{bookingFeePercent}% booking fee on the semester rent</li>
            )}
            {advanceRentRequired && <li>Advance rent required before move-in</li>}
          </ul>
        </div>
      )}
      {!compact && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Before you move in
          </p>
          <ol className="mt-1.5 list-inside list-decimal space-y-1 text-xs text-muted-foreground">
            <li>Reserve a free room. No payment is needed to hold it.</li>
            <li>Agree tenancy terms and pay the landlord directly.</li>
            <li>Confirm your move-in here so the room is marked occupied.</li>
          </ol>
        </div>
      )}
      {!compact && custodianName && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Custodian
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <User aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            {custodianName}
          </p>
          {custodianPhone && (
            <a
              href={`tel:${custodianPhone}`}
              className="mt-1 flex items-center gap-1.5 text-sm text-teal-700 hover:text-teal-900"
            >
              <Phone aria-hidden className="size-4 shrink-0" />
              {custodianPhone}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
