import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  listingDetailResponseSchema,
  type ListingDetailResponse,
} from "@campushomes/shared";

import { api, ApiError } from "@/lib/api";
import { listingPhotoUrl } from "@/lib/cloudinary";
import { formatAddress } from "@/lib/format";
import { getSavedListings } from "@/lib/saved-listings";
import { getServerSession } from "@/lib/session";
import { getMyReservations } from "@/lib/reservations";
import { getStudentProfile } from "@/lib/student";
import { amenityLabel } from "@/lib/amenity-label";
import { ListingStructuredData } from "@/components/seo/site-structured-data";
import { ListingExperience } from "@/components/listing/listing-experience";
import { ListingGallery } from "@/components/listing/listing-gallery";
import { BackButton } from "@/components/back-button";
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

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const listingId = (await params).id;
  const [detail, session] = await Promise.all([getDetail(listingId), getServerSession()]);
  if (!detail) notFound();
  const isStudent = !!(session?.user.status === "active" && session.access.workspaces.includes("student"));
  const [profile, saved, reservations] = await Promise.all([
    isStudent ? getStudentProfile() : null, isStudent ? getSavedListings() : [], isStudent ? getMyReservations() : [],
  ]);
  const { property, listing, version, photos, units, availability, propertyMedia, unitPhotos } = detail;
  const heldBeds: [string, "reserved" | "booked"][] = reservations.filter(row => row.status === "reserved" || row.status === "booked").map(row => [row.bedId, row.status as "reserved" | "booked"]);
  const availableUnitIds = new Set(availability.filter(bed => bed.available).map(bed => bed.unit_id));
  const prices = units.filter(unit => availableUnitIds.has(unit.id)).map(unit => unit.pricePerTermUgx);
  const minPriceUgx = prices.length ? Math.min(...prices) : null;
  const orderedPhotos = [...photos].sort((a,b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder);
  const galleryPhotos = [
    ...orderedPhotos.map(photo => ({ id: photo.id, storageKey: photo.storageKey, group: "Inspection" })),
    ...propertyMedia.map(photo => ({ id: photo.id, storageKey: photo.storage_key, group: "Property" })),
    ...unitPhotos.map(photo => ({ id: `${photo.unitId}-${photo.storageKey}`, storageKey: photo.storageKey, group: "Rooms" })),
  ].filter((photo,index,all) => all.findIndex(other => other.storageKey === photo.storageKey) === index);
  const amenities = Object.entries(version.amenities).filter(([,has]) => has).map(([key]) => key);
  const identity = <>
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground"><BackButton fallbackHref="/search" label="Back to results"/><span aria-hidden>/</span><Link href="/search?campus=MUK">Makerere hostels</Link><span aria-hidden>/</span><span>{property.name}</span></nav>
    <header className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl leading-tight tracking-tight sm:text-3xl">{property.name}</h1><VerifiedBadge/></div><p className="mt-3 text-muted-foreground">{formatAddress(property.street_address)}</p><p className="mt-2 text-sm text-muted-foreground">{listing.verifiedAt ? `Inspected ${new Date(listing.verifiedAt).toLocaleDateString("en-UG", {day:"numeric",month:"long",year:"numeric"})}` : "Inspection date unavailable"} · <Link href="/safety" className="underline">Inspection explained</Link></p></div>{(isStudent || !session) && <div className="relative shrink-0"><SaveButton listingId={listingId} initialSaved={saved.some(row => row.id === listingId)} signedOut={!session}/></div>}</header>
  </>;
  return <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    {minPriceUgx !== null && <ListingStructuredData listing={{ id: listingId, name: property.name, streetAddress: property.street_address, lat: property.gps_lat, lon: property.gps_lon, minPriceUgx, maxPriceUgx: Math.max(...prices), photoKeys: galleryPhotos.map(photo => photo.storageKey), amenities: amenities.map(amenityLabel) }}/>}
    <TrackRecentlyViewed id={listingId} name={property.name} streetAddress={property.street_address} photoStorageKey={galleryPhotos[0]?.storageKey ?? null} priceUgx={minPriceUgx ?? 0}/>
    <ListingGallery photos={galleryPhotos} propertyName={property.name}/>
    <ListingExperience identity={identity} studentUniversity={profile?.university ?? null} detail={detail} canReserve={isStudent} signedIn={!!session} needsProfile={isStudent && profile === null} heldBeds={heldBeds} savedIds={saved.map(row => row.id)}/>
  </div>;
}
