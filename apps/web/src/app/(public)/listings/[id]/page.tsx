import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BedDouble, Camera, Check } from "lucide-react";
import {
  listingDetailResponseSchema,
  type ListingDetailResponse,
} from "@campushomes/shared";

import { api, ApiError } from "@/lib/api";
import { listingPhotoUrl } from "@/lib/cloudinary";
import { formatUgx, humanizeKey } from "@/lib/format";
import { getServerSession } from "@/lib/session";
import { getStudentProfile } from "@/lib/student";
import { ReserveButton } from "@/components/reserve-button";
import { StatusChip } from "@/components/status-chip";
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
  const studentProfile = isStudent ? await getStudentProfile() : null;
  const canReserve = isStudent && studentProfile !== null;
  const needsProfile = isStudent && studentProfile === null;

  const { property, version, photos, units, availability } = detail;
  const availableByUnit = new Map(availability.map((a) => [a.id, a.available]));
  const amenities = Object.entries(version.amenities)
    .filter(([, has]) => has)
    .map(([key]) => humanizeKey(key));
  const orderedPhotos = [...photos].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder,
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Link
        href="/search"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Back to search
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl">{property.name}</h1>
        <VerifiedBadge />
      </div>
      <p className="mt-1 text-md text-muted-foreground">{property.street_address}</p>

      {/* Photos — inspector-captured, EXIF-verified server-side */}
      {orderedPhotos.length === 0 ? (
        <div className="mt-6 flex h-64 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <span className="inline-flex items-center gap-2 text-sm">
            <Camera aria-hidden className="size-4" />
            Inspection photos coming soon
          </span>
        </div>
      ) : (
        <div className="mt-6 grid gap-2 sm:grid-cols-3 sm:grid-rows-2">
          {orderedPhotos.slice(0, 5).map((photo, i) => {
            const url = listingPhotoUrl(photo.storageKey, i === 0 ? 1200 : 600);
            return (
              <div
                key={photo.id}
                className={
                  i === 0
                    ? "relative h-64 overflow-hidden rounded-lg sm:col-span-2 sm:row-span-2 sm:h-full sm:min-h-96"
                    : "relative hidden overflow-hidden rounded-lg sm:block"
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

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_minmax(0,22rem)]">
        <div>
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
              Rooms
            </h2>
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
              {units.map((unit) => {
                const available = availableByUnit.get(unit.id) ?? false;
                return (
                  <li
                    key={unit.id}
                    className="flex flex-wrap items-center gap-3 p-4"
                  >
                    <BedDouble aria-hidden className="size-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{unit.label}</p>
                      <p className="text-sm text-muted-foreground">
                        Sleeps {unit.capacity}
                      </p>
                    </div>
                    {available ? (
                      canReserve ? (
                        <ReserveButton unitId={unit.id} />
                      ) : (
                        <StatusChip tone="success">Available</StatusChip>
                      )
                    ) : (
                      <StatusChip tone="warning">On hold</StatusChip>
                    )}
                  </li>
                );
              })}
              {units.length === 0 && (
                <li className="p-4 text-sm text-muted-foreground">
                  Room list is being finalised by our team.
                </li>
              )}
            </ul>
          </section>
        </div>

        {/* Reservation panel — Phase 4 wires the real hold flow */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-lg border border-border bg-card p-5 shadow-xs">
            <p className="tabular font-display text-2xl font-semibold">
              {formatUgx(version.pricePerTermUgx)}
              <span className="text-sm font-normal text-muted-foreground"> / term</span>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Reserve any available room with a one-time{" "}
              <strong className="text-foreground">UGX 5,000</strong> fee — the
              room is held for you for 72 hours.
            </p>
            {!session && (
              <Link
                href="/sign-in"
                className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 font-semibold text-primary-foreground shadow-xs transition-colors duration-150 hover:bg-teal-700"
              >
                Sign in to reserve
              </Link>
            )}
            {needsProfile && (
              <Link
                href={`/profile?next=/listings/${listingId}`}
                className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 font-semibold text-primary-foreground shadow-xs transition-colors duration-150 hover:bg-teal-700"
              >
                Complete your profile to reserve
              </Link>
            )}
            {canReserve && (
              <p className="mt-4 text-sm font-semibold text-foreground">
                Select an available room below to reserve.
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Rent and tenancy terms are agreed directly with the landlord.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
