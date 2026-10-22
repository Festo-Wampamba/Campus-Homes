"use client";

import Link from "next/link";
import { BedDouble, Building2, MapPin, Star } from "lucide-react";
import { useState } from "react";
import { formatRoadTrip } from "@/lib/distance";
import type { ListingSearchResult } from "@campushomes/shared";
import { SaveButton } from "@/components/save-button";
import { VerifiedBadge } from "@/components/verified-badge";
import { listingPhotoUrl } from "@/lib/cloudinary";
import { formatAddress, formatUgx, GENDER_ARRANGEMENT_LABELS, roomCategoryLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export function HostelCard({ listing, layout = "vertical", canSave = false, saved = false, onRemove, priority = false }: {
  listing: ListingSearchResult; layout?: "horizontal" | "vertical"; canSave?: boolean; saved?: boolean; onRemove?: (id: string) => Promise<void>; priority?: boolean;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const photo = listing.photo_storage_key ? listingPhotoUrl(listing.photo_storage_key, 720) : null;
  const facts = listing as ListingSearchResult & { verified_at?: string | null; rating_average?: number | null; rating_count?: number };
  // Road distance only (Festo, 2026-10-22); straight-line lives in the estimator.
  const roadTrip = listing.road_distance_m != null && listing.road_duration_s != null ? formatRoadTrip(listing.road_distance_m, listing.road_duration_s) : null;
  return <article className="relative h-full overflow-hidden rounded-2xl border border-border bg-card shadow-xs transition-shadow duration-200 hover:shadow-md">
    <div className="absolute right-3 top-3 z-1">
      {onRemove ? <button type="button" disabled={removing} className="min-h-11 rounded-full border border-border bg-card px-3 text-sm font-semibold" onClick={async () => { setRemoving(true); setError(null); try { await onRemove(listing.id); } catch { setError("Couldn't remove this favourite. Try again."); } finally { setRemoving(false); } }}>Remove</button> : <SaveButton listingId={listing.id} initialSaved={saved} signedOut={!canSave} />}
    </div>
    <Link href={`/listings/${listing.id}`} className={cn("group flex h-full flex-col", layout === "horizontal" && "xl:flex-row")}>
      <div className={cn("relative aspect-[16/10] shrink-0 overflow-hidden bg-muted", layout === "horizontal" && "xl:aspect-auto xl:w-[46%] xl:min-h-64")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- inspection storage can use arbitrary configured origins */}
        {photo && !photoFailed ? <img src={photo} alt={listing.name} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} onError={() => setPhotoFailed(true)} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]" /> : <div className="flex h-full min-h-48 items-center justify-center"><Building2 aria-hidden className="size-10 text-muted-foreground" /><span className="sr-only">No property photo available</span></div>}
        <div className="absolute bottom-3 left-3"><VerifiedBadge /></div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-5">
        <p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin aria-hidden className="size-4 shrink-0" /><span className="line-clamp-1">{formatAddress(listing.street_address)}</span></p>
        <h3 className="mt-2 line-clamp-2 font-display text-lg font-semibold leading-snug group-hover:text-primary">{listing.name}</h3>
        {facts.rating_average != null && Boolean(facts.rating_count) && <p className="mt-2 flex items-center gap-1 text-sm"><Star aria-hidden className="size-4 fill-coral-500 text-coral-600" />{Number(facts.rating_average).toFixed(1)} <span className="text-muted-foreground">({facts.rating_count} reviews)</span></p>}
        <p className="mt-3 flex items-center gap-2 text-sm"><BedDouble aria-hidden className="size-4 shrink-0" />{[...new Set(listing.room_categories.map(room => roomCategoryLabel(room.category)))].join(" · ") || "Student rooms"}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">{listing.gender_arrangement && <span>{GENDER_ARRANGEMENT_LABELS[listing.gender_arrangement]}</span>}<span>{listing.unit_count === 0 ? "Check bathroom details on the property page" : listing.has_self_contained ? "Self-contained options" : "Shared bathroom"}</span></div>
        <p className="mt-3 text-sm font-semibold text-teal-700 dark:text-teal-100">{listing.unit_count > 0 ? "Rooms available" : "Currently unavailable"}</p>
        {roadTrip && <p className="mt-1 text-xs text-muted-foreground">{roadTrip} to campus</p>}
        {facts.verified_at && <p className="mt-1 text-xs text-muted-foreground">Inspected {new Date(facts.verified_at).toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Kampala" })}</p>}
        {listing.min_capacity != null && <p className="mt-1 text-xs text-muted-foreground">{listing.min_capacity === listing.max_capacity ? listing.min_capacity : `${listing.min_capacity}–${listing.max_capacity}`} students per room</p>}
        <div className="mt-auto pt-4">{listing.unit_count > 0 ? <><p className="text-xs text-muted-foreground">{listing.max_price_per_term_ugx > listing.price_per_term_ugx ? "From" : "Semester rent"}</p><p className="tabular font-display text-xl font-semibold">{formatUgx(listing.price_per_term_ugx)}</p><p className="mt-0.5 text-xs text-muted-foreground">per bed, per semester</p></> : <p className="font-semibold text-muted-foreground">Currently unavailable</p>}</div>
      </div>
    </Link>
    {error && <p role="alert" className="px-5 pb-4 text-sm text-destructive">{error}</p>}
  </article>;
}
