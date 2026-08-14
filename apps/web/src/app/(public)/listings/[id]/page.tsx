import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import { BackButton } from "@/components/back-button";
import { RoomCategoryList } from "@/components/room-category-list";
import { SaveButton } from "@/components/save-button";
import { TrackRecentlyViewed } from "@/components/track-recently-viewed";
import { VerifiedBadge } from "@/components/verified-badge";

// Renders the version snapshot the API returns — never re-fetch live listing
// fields (FRONTEND.md §7.2); students reserve against exactly this snapshot.
async function getDetail(id: string): Promise<ListingDetailResponse | null> {
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
}

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
  const canReserve = isStudent && studentProfile !== null;
  const needsProfile = isStudent && studentProfile === null;
  const isSaved = savedListings.some((row) => row.id === listingId);

  const { property, version, photos, units, unitPhotos, availability } = detail;
  const unitPrices = units.map((u) => u.pricePerTermUgx);
  const minPriceUgx = unitPrices.length > 0 ? Math.min(...unitPrices) : version.pricePerTermUgx;
  const maxPriceUgx = unitPrices.length > 0 ? Math.max(...unitPrices) : version.pricePerTermUgx;
  const amenities = Object.entries(version.amenities)
    .filter(([, has]) => has)
    .map(([key]) => humanizeKey(key));
  const orderedPhotos = [...photos].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder,
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <TrackRecentlyViewed
        id={listingId}
        name={property.name}
        streetAddress={property.street_address}
        photoStorageKey={orderedPhotos[0]?.storageKey ?? null}
        priceUgx={minPriceUgx}
      />
      <BackButton fallbackHref="/search" label="Back" />

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl tracking-[-0.035em] sm:text-4xl">{property.name}</h1>
        <VerifiedBadge />
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
          {/* Photos — inspector-captured, EXIF-verified server-side */}
          <div className="mb-8">
            {orderedPhotos.length === 0 ? (
              <div className="flex h-72 items-center justify-center rounded-2xl bg-teal-50 text-muted-foreground">
                <span className="inline-flex items-center gap-2 text-sm">
                  <Camera aria-hidden className="size-4" />
                  Inspection photos coming soon
                </span>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-3 sm:grid-rows-2">
                {orderedPhotos.slice(0, 5).map((photo, i) => {
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
                          alt={`${property.name} — inspection photo ${i + 1}`}
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
            />
          </section>
        </div>

        {/* Reservation panel — pinned so price + CTA are never scrolled out
            of view: a sticky sidebar on desktop, a fixed bottom bar on
            mobile (there's no room beside the content there). */}
        <aside className="hidden lg:sticky lg:top-20 lg:block lg:self-start">
          <MoneyCard
            session={session}
            needsProfile={needsProfile}
            canReserve={canReserve}
            listingId={listingId}
            minPriceUgx={minPriceUgx}
            maxPriceUgx={maxPriceUgx}
            custodianName={property.custodian_name}
            custodianPhone={property.custodian_phone}
          />
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/96 p-3 shadow-[0_-12px_32px_-18px_rgba(0,47,47,0.35)] backdrop-blur-xl lg:hidden">
        <MoneyCard
          session={session}
          needsProfile={needsProfile}
          canReserve={canReserve}
          listingId={listingId}
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
  needsProfile,
  canReserve,
  listingId,
  minPriceUgx,
  maxPriceUgx,
  custodianName,
  custodianPhone,
  compact = false,
}: {
  session: Awaited<ReturnType<typeof getServerSession>>;
  needsProfile: boolean;
  canReserve: boolean;
  listingId: string;
  minPriceUgx: number;
  maxPriceUgx: number;
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
      {needsProfile && (
        <Link
          href={`/profile?next=/listings/${listingId}`}
          className={cn(
            "inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 font-semibold text-primary-foreground shadow-xs transition duration-300 hover:bg-teal-700 active:scale-[0.98]",
            compact ? "shrink-0" : "mt-4 w-full",
          )}
        >
          Complete your profile
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
