"use client";

import { useState } from "react";
import { BedDouble, Images } from "lucide-react";
import type { ListingDetailResponse } from "@campushomes/shared";

import { formatUgx, roomCategoryLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ReserveButton } from "@/components/reserve-button";
import { StatusChip } from "@/components/status-chip";
import { PhotoLightbox, type LightboxPhoto, type LightboxState } from "@/components/listing/photo-lightbox";

type Unit = ListingDetailResponse["units"][number];
type UnitPhoto = ListingDetailResponse["unitPhotos"][number];

type CategoryGroup = {
  key: string;
  category: string;
  selfContained: boolean;
  pricePerTermUgx: number;
  depositUgx: number | null;
  capacity: number;
  roomCount: number;
  // Sum of available BEDS across every unit in this category (bed-level
  // inventory, 0033) — a partially-let double still counts its one free bed.
  availableCount: number;
  firstAvailableBedId: string | null;
  // Room-specific photos across every unit in this category — a student
  // reserves "a Double", not one numbered room, so photos from any double
  // in the category are representative of what they'd get.
  roomPhotos: LightboxPhoto[];
};

// A category can back hundreds of physical rooms — rendering one row per
// room would be both unusable and pointless (a student reserves "a Double",
// not a specific numbered room). One row per category; reserving auto-picks
// any available bed in that category server-side, same reserve() logic.
function groupByCategory(
  units: Unit[],
  availableBedsByUnit: Map<string, { id: string; available: boolean }[]>,
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
    const key = `${unit.roomCategory}-${unit.selfContained}-${unit.pricePerTermUgx}`;
    const beds = availableBedsByUnit.get(unit.id) ?? [];
    const availableBeds = beds.filter((b) => b.available);
    const unitPhotoList = photosByUnit.get(unit.id) ?? [];
    const existing = groups.get(key);
    if (existing) {
      existing.roomCount += 1;
      existing.roomPhotos.push(...unitPhotoList);
      existing.availableCount += availableBeds.length;
      existing.firstAvailableBedId ??= availableBeds[0]?.id ?? null;
    } else {
      groups.set(key, {
        key,
        category: unit.roomCategory,
        selfContained: unit.selfContained,
        pricePerTermUgx: unit.pricePerTermUgx,
        depositUgx: unit.depositUgx,
        capacity: unit.capacity,
        roomCount: 1,
        availableCount: availableBeds.length,
        firstAvailableBedId: availableBeds[0]?.id ?? null,
        roomPhotos: [...unitPhotoList],
      });
    }
  }
  return [...groups.values()].sort((a, b) => a.pricePerTermUgx - b.pricePerTermUgx);
}

export function RoomCategoryList({
  listingId,
  units,
  availability,
  photos,
  unitPhotos,
  propertyName,
  canReserve,
  needsProfile,
}: {
  listingId: string;
  units: Unit[];
  availability: { id: string; unit_id: string; available: boolean }[];
  photos: LightboxPhoto[];
  unitPhotos: UnitPhoto[];
  propertyName: string;
  canReserve: boolean;
  needsProfile: boolean;
}) {
  const availableBedsByUnit = new Map<string, { id: string; available: boolean }[]>();
  for (const bed of availability) {
    const list = availableBedsByUnit.get(bed.unit_id) ?? [];
    list.push({ id: bed.id, available: bed.available });
    availableBedsByUnit.set(bed.unit_id, list);
  }
  const groups = groupByCategory(units, availableBedsByUnit, unitPhotos);
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
      <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {groups.map((group) => (
          <li
            key={group.key}
            className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
                <BedDouble aria-hidden className="size-5" />
              </span>
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="font-display font-semibold">
                    {roomCategoryLabel(group.category)}
                  </p>
                  {group.selfContained && (
                    <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">
                      Self-contained
                    </span>
                  )}
                </div>
                <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                  <span>Sleeps {group.capacity}</span>
                  <span aria-hidden>·</span>
                  <span>
                    {group.roomCount} {group.roomCount === 1 ? "room" : "rooms"}
                  </span>
                </p>
                {group.availableCount > 0 ? (
                  <StatusChip tone="success">
                    {group.availableCount} {group.availableCount === 1 ? "bed" : "beds"} free
                  </StatusChip>
                ) : (
                  <StatusChip tone="warning">Fully booked</StatusChip>
                )}
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-3 sm:items-end">
              <div className="sm:text-right">
                <p className="tabular whitespace-nowrap font-display text-lg font-semibold text-foreground">
                  {formatUgx(group.pricePerTermUgx)}
                </p>
                <p className="whitespace-nowrap text-xs text-muted-foreground">
                  per bed / semester
                  {group.depositUgx != null && ` · Deposit ${formatUgx(group.depositUgx)}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {group.roomPhotos.length > 0 && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setLightbox({
                        photos: group.roomPhotos,
                        index: 0,
                        caption: "Photos of this room, uploaded by the landlord.",
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
                        caption: "General photos of the property.",
                      })
                    }
                  >
                    <Images aria-hidden className="size-4" />
                    Property photos
                  </Button>
                )}
                {canReserve && group.firstAvailableBedId && (
                  <ReserveButton
                    bedId={group.firstAvailableBedId}
                    listingId={listingId}
                    needsProfile={needsProfile}
                  />
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <PhotoLightbox
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
