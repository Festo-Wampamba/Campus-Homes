import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Camera, Check, Phone, User } from "lucide-react";
import {
  listingDetailResponseSchema,
  type ListingDetailResponse,
} from "@campushomes/shared";

import { api, ApiError } from "@/lib/api";
import { listingPhotoUrl } from "@/lib/cloudinary";
import { formatPriceRange, humanizeKey } from "@/lib/format";
import { getSavedListings } from "@/lib/saved-listings";
import { getServerSession } from "@/lib/session";
import { getStudentProfile } from "@/lib/student";
import { cn } from "@/lib/utils";
import { AskLandlordDialog } from "@/components/listing/ask-landlord-dialog";
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
  const detail = await getDetail((await params).id);
  return { title: detail ? detail.property.name : "Listing" };
}

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const listingId = (await params).id;
  const [detail, session] = await Promise.all([getDetail(listingId), getServerSession()]);
  if (!detail) notFound();
  const isStudent = session?.user.role === "student";
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
  const amenities = Object.entries(version.amenities)
    .filter(([, has]) => has)
    .map(([key]) => humanizeKey(key));
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

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl tracking-[-0.035em] sm:text-4xl">{property.name}</h1>
        <VerifiedBadge />
        <Link href="/#verified" className="text-xs font-semibold text-teal-700 underline-offset-4 hover:underline dark:text-teal-300">
          What does Verified mean?
        </Link>
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
        {isStudent && (
          <div className="ml-auto">
            <SaveButton listingId={listingId} initialSaved={isSaved} />
          </div>
        )}
      </div>
      <p className="mt-1 text-md text-muted-foreground">{property.street_address}</p>

      {/* Gallery + money/custodian card sit side by side on large screens,
          starting at the same vertical position — the reservation card is
          never scrolled below the photos, same layout logic as an
          e-commerce product image + buy box. */}
      <div className="mt-7 grid gap-10 lg:grid-cols-[1fr_minmax(0,24rem)] lg:items-start">
        <div>
          {/* Photos — inspector-captured (EXIF-verified) plus the
              landlord's own whole-property shots (property_media, 0026) */}
          <div className="mb-8">
            {galleryPhotos.length === 0 ? (
              <div className="flex h-72 items-center justify-center rounded-2xl bg-teal-50 text-muted-foreground">
                <span className="inline-flex items-center gap-2 text-sm">
                  <Camera aria-hidden className="size-4" />
                  Photos coming soon
                </span>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-3 sm:grid-rows-2">
                {galleryPhotos.slice(0, 5).map((photo, i) => {
                  const url = listingPhotoUrl(photo.storageKey, i === 0 ? 1200 : 600);
                  return (
                    <div
                      key={photo.id}
                      className={
                        i === 0
                          ? "relative h-72 overflow-hidden rounded-2xl sm:col-span-2 sm:row-span-2 sm:h-full sm:min-h-[30rem]"
                          : "relative hidden overflow-hidden rounded-xl sm:block"
                      }
                    >
                      {url ? (
                        <Image
                          src={url}
                          alt={`${property.name} — photo ${i + 1}`}
                          fill
                          sizes={i === 0 ? "(min-width: 640px) 66vw, 100vw" : "33vw"}
                          className="object-cover"
                          priority={i === 0}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-muted text-muted-foreground">
                          <Camera aria-hidden className="size-5" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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

          {amenities.length > 0 && (
            <section aria-labelledby="amenities-heading" className="mt-8">
              <h2 id="amenities-heading" className="text-xl">
                Amenities we confirmed
              </h2>
              <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                {amenities.map((amenity) => (
                  <li key={amenity} className="flex items-center gap-2 text-base">
                    <Check aria-hidden className="size-4 shrink-0 text-success" />
                    {amenity}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="units-heading" className="mt-8">
            <h2 id="units-heading" className="text-xl">
              Room types
            </h2>
            <RoomCategoryList
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
          <section aria-labelledby="ask-heading" className="mt-8 max-w-sm">
            <h2 id="ask-heading" className="text-xl">
              Have a question?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask the landlord directly, or request a viewing — no reservation needed.
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
        <aside className="hidden lg:sticky lg:top-20 lg:block lg:self-start">
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
  custodianName?: string;
  custodianPhone?: string | null;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "flex items-center justify-between gap-3" : "rounded-2xl border border-border bg-card p-6 shadow-[0_22px_50px_-32px_rgba(0,47,47,0.35)]"}>
      <div>
        <p className="tabular font-display text-2xl font-semibold">
          {minPriceUgx !== maxPriceUgx && (
            <span className="mr-1 text-base font-normal text-muted-foreground">From</span>
          )}
          {formatPriceRange(minPriceUgx, maxPriceUgx)}
          <span className="text-sm font-normal text-muted-foreground"> / semester</span>
        </p>
        {!compact && (
          <p className="mt-2 text-sm text-muted-foreground">
            Reserve any available room — it&apos;s free to hold your spot.
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
            "text-sm font-semibold text-foreground",
            compact ? "shrink-0 text-right" : "mt-4",
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
            <li>Reserve a free room — no payment needed to hold it.</li>
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
