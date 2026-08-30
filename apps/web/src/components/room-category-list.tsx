"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, DoorOpen, Images, X } from "lucide-react";
import type { ListingDetailResponse } from "@campushomes/shared";

import { listingPhotoUrl } from "@/lib/cloudinary";
import { formatUgx, roomCategoryLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ReserveButton } from "@/components/reserve-button";
import { StatusChip } from "@/components/status-chip";

type Unit = ListingDetailResponse["units"][number];
type UnitPhoto = ListingDetailResponse["unitPhotos"][number];

// Both listing_photos (inspection gallery) and unit_photos (per-room) carry
// enough here — the lightbox only ever needs a storageKey to resolve a URL.
type LightboxPhoto = { storageKey: string };

type CategoryGroup = {
  key: string;
  category: string;
  pricePerTermUgx: number;
  depositUgx: number | null;
  capacity: number;
  roomCount: number;
  availableCount: number;
  firstAvailableUnitId: string | null;
  // Room-specific photos across every unit in this category — a student
  // reserves "a Double", not one numbered room, so photos from any double
  // in the category are representative of what they'd get.
  roomPhotos: LightboxPhoto[];
};

// A category can back hundreds of physical rooms — rendering one row per
// room would be both unusable and pointless (a student reserves "a Double",
// not a specific numbered room). One row per category; reserving auto-picks
// any available unit in that category server-side identity, same hold logic.
function groupByCategory(
  units: Unit[],
  availableByUnit: Map<string, boolean>,
  unitPhotos: UnitPhoto[],
): CategoryGroup[] {
  const photosByUnit = new Map<string, LightboxPhoto[]>();
  for (const photo of unitPhotos) {
    const list = photosByUnit.get(photo.unitId) ?? [];
    list.push({ storageKey: photo.storageKey });
    photosByUnit.set(photo.unitId, list);
  }

  const groups = new Map<string, CategoryGroup>();
  for (const unit of units) {
    const key = `${unit.roomCategory}-${unit.pricePerTermUgx}`;
    const isAvailable = availableByUnit.get(unit.id) ?? false;
    const unitPhotoList = photosByUnit.get(unit.id) ?? [];
    const existing = groups.get(key);
    if (existing) {
      existing.roomCount += 1;
      existing.roomPhotos.push(...unitPhotoList);
      if (isAvailable) {
        existing.availableCount += 1;
        existing.firstAvailableUnitId ??= unit.id;
      }
    } else {
      groups.set(key, {
        key,
        category: unit.roomCategory,
        pricePerTermUgx: unit.pricePerTermUgx,
        depositUgx: unit.depositUgx,
        capacity: unit.capacity,
        roomCount: 1,
        availableCount: isAvailable ? 1 : 0,
        firstAvailableUnitId: isAvailable ? unit.id : null,
        roomPhotos: [...unitPhotoList],
      });
    }
  }
  return [...groups.values()].sort((a, b) => a.pricePerTermUgx - b.pricePerTermUgx);
}

type LightboxState = { photos: LightboxPhoto[]; index: number; caption: string };

export function RoomCategoryList({
  units,
  availability,
  photos,
  unitPhotos,
  propertyName,
  canReserve,
  needsProfile,
}: {
  units: Unit[];
  availability: { id: string; available: boolean }[];
  photos: LightboxPhoto[];
  unitPhotos: UnitPhoto[];
  propertyName: string;
  canReserve: boolean;
  needsProfile: boolean;
}) {
  const availableByUnit = new Map(availability.map((a) => [a.id, a.available]));
  const groups = groupByCategory(units, availableByUnit, unitPhotos);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  if (groups.length === 0) {
    return (
      <p className="mt-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        Room list is being finalised by our team.
      </p>
    );
  }

  return (
    <>
      <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
        {groups.map((group) => (
          <li key={group.key} className="flex flex-wrap items-center gap-3 p-4">
            <DoorOpen aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{roomCategoryLabel(group.category)}</p>
              <p className="text-sm text-muted-foreground">
                Sleeps {group.capacity} · {group.roomCount}{" "}
                {group.roomCount === 1 ? "room" : "rooms"}
              </p>
            </div>
            <p className="tabular text-sm font-semibold text-foreground">
              {formatUgx(group.pricePerTermUgx)}
              <span className="font-normal text-muted-foreground"> / semester</span>
              {group.depositUgx != null && (
                <span className="block text-xs font-normal text-muted-foreground">
                  + {formatUgx(group.depositUgx)} deposit
                </span>
              )}
            </p>
            {group.availableCount > 0 ? (
              <StatusChip tone="success">{group.availableCount} free</StatusChip>
            ) : (
              <StatusChip tone="warning">Fully booked</StatusChip>
            )}
            {group.roomPhotos.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setLightbox({
                    photos: group.roomPhotos,
                    index: 0,
                    caption: `Photos of this room, uploaded by the landlord.`,
                  })
                }
              >
                <Images aria-hidden className="size-4" />
                Room photos
              </Button>
            )}
            {photos.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setLightbox({
                    photos,
                    index: 0,
                    caption: "Photos from our inspection visit — general property photos.",
                  })
                }
              >
                <Images aria-hidden className="size-4" />
                Inspection photos
              </Button>
            )}
            {canReserve && group.firstAvailableUnitId && (
              <ReserveButton unitId={group.firstAvailableUnitId} needsProfile={needsProfile} />
            )}
          </li>
        ))}
      </ul>

      <Lightbox
        state={lightbox}
        propertyName={propertyName}
        onClose={() => setLightbox(null)}
        onNavigate={(delta) =>
          setLightbox((s) =>
            s ? { ...s, index: (s.index + delta + s.photos.length) % s.photos.length } : s,
          )
        }
      />
    </>
  );
}

/** Full-size photo viewer, shared between the inspection gallery and a
 * category's room-specific photos — `state` carries which set is open and
 * the caption explaining what the student is looking at. */
function Lightbox({
  state,
  propertyName,
  onClose,
  onNavigate,
}: {
  state: LightboxState | null;
  propertyName: string;
  onClose: () => void;
  onNavigate: (delta: 1 | -1) => void;
}) {
  const open = state !== null;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onNavigate(1);
      if (e.key === "ArrowLeft") onNavigate(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, onNavigate]);

  if (!state) return null;
  const photo = state.photos[state.index];
  const url = listingPhotoUrl(photo.storageKey, 1600);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="Close photo viewer"
        onClick={onClose}
        className="absolute top-4 right-4 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X aria-hidden className="size-6" />
      </button>

      {state.photos.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(-1);
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white sm:left-4"
          >
            <ChevronLeft aria-hidden className="size-7" />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(1);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white sm:right-4"
          >
            <ChevronRight aria-hidden className="size-7" />
          </button>
        </>
      )}

      {url && (
        <LightboxImage
          // Remounts per photo — the cleanest way to reset the loading
          // spinner without a setState-in-effect.
          key={`${photo.storageKey}-${state.index}`}
          url={url}
          alt={`${propertyName} — photo ${state.index + 1}`}
        />
      )}
      <p className="mt-3 text-center text-sm text-white/70">
        {state.caption}
        {state.photos.length > 1 && ` (${state.index + 1} / ${state.photos.length})`}
      </p>
    </div>
  );
}

function LightboxImage({ url, alt }: { url: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {!loaded && (
        <div
          aria-hidden
          className="size-16 animate-spin rounded-full border-4 border-white/20 border-t-white/80"
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- full-viewport lightbox of an arbitrary-origin storage URL, next/image's fixed-layout modes don't fit this */}
      <img
        src={url}
        alt={alt}
        className={cn("max-h-[80vh] max-w-full rounded-md object-contain", !loaded && "hidden")}
        onLoad={() => setLoaded(true)}
        onClick={(e) => e.stopPropagation()}
      />
    </>
  );
}
