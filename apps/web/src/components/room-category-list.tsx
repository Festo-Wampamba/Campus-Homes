"use client";

import { useState } from "react";
import Link from "next/link";
import { Banknote, Bath, BedDouble, CircleCheck, Images, ShowerHead, Users, type LucideIcon } from "lucide-react";
import { MAX_ACTIVE_RESERVATIONS, ROOM_CATEGORIES, type ListingDetailResponse, type ListingPhoto } from "@campushomes/shared";

import { formatUgx, roomCategoryLabel } from "@/lib/format";
import { listingPhotoUrl } from "@/lib/cloudinary";
import { photosForRoomType } from "@/lib/room-type-photos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogHeader } from "@/components/ui/dialog";
import { AmenityList } from "@/components/listing/amenity-list";
import { FeatureIcon } from "@/components/listing/feature-icon";
import { ReserveButton } from "@/components/reserve-button";
import { StatusChip } from "@/components/status-chip";
import { PhotoLightbox, type LightboxPhoto, type LightboxState } from "@/components/listing/photo-lightbox";

type Unit = ListingDetailResponse["units"][number] & { amenities?: unknown };
type UnitPhoto = ListingDetailResponse["unitPhotos"][number];

/** A room's amenities are intentionally separate from listing amenities.
 * Callers may provide the published room-type snapshot by unit id; if a
 * response already carries `unit.amenities`, that is also accepted. */
export type RoomAmenitiesByUnit = ReadonlyMap<string, unknown> | Readonly<Record<string, unknown>>;

export type CategoryGroup = {
  key: string;
  category: string;
  selfContained: boolean;
  pricePerTermUgx: number;
  depositUgx: number | null;
  capacity: number;
  // Rooms with at least one free bed: a single, or a double/triple/quad with
  // every bed reserved or booked, drops out of the count.
  freeRoomCount: number;
  // Sum of available BEDS across every unit in this category (bed-level
  // inventory, 0033) — a partially-let double still counts its one free bed.
  availableCount: number;
  firstAvailableBedId: string | null;
  // Set when the signed-in student already holds a bed of this room type.
  myStatus: "reserved" | "booked" | null;
  // This room type's photos only: the inspection photos linked to it (any
  // angle, its en-suite bathroom included) plus the landlord's own photos of
  // any room in it. A student reserves "a Double", not one numbered room.
  roomPhotos: LightboxPhoto[];
  // Published room-level amenities only. Property amenities are never copied
  // here, so a missing value simply leaves this section out of the dialog.
  roomAmenities: string[];
};

export function roomDisplayLabel(group: Pick<CategoryGroup, "category" | "selfContained">): string {
  const base = roomCategoryLabel(group.category);
  // Only self-contained is called out; plain types read "Single", "Double"… (Festo, 2026-10-23).
  return group.selfContained && !base.toLowerCase().includes("self-contained") ? `${base} self-contained` : base;
}

/** How much of this room type is free, so 30 rooms never read as "2 rooms". */
// Public pages never say how many rooms or beds are free (Festo, 2026-10-23,
// reversing 2026-10-22): landlords see the counts in Manage rooms.
export function availabilityLabel(group: Pick<CategoryGroup, "availableCount">): string {
  return group.availableCount > 0 ? "Available" : "Currently unavailable";
}

export function roomBathroomLabel(group: Pick<CategoryGroup, "selfContained">): string {
  return group.selfContained ? "Private bathroom" : "Shared bathroom";
}

function roomAmenityValue(source: RoomAmenitiesByUnit | undefined, unitId: string): unknown {
  if (!source) return undefined;
  if ("get" in source && typeof source.get === "function") return source.get(unitId);
  return (source as Readonly<Record<string, unknown>>)[unitId];
}

function bathroomIcon(selfContained: boolean): LucideIcon {
  return selfContained ? Bath : ShowerHead;
}

/** Accept the published room snapshot's common array/object shapes while
 * keeping all text tied to supplied room data. */
export function normalizeRoomAmenities(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === "string") return item.trim() ? [item.trim()] : [];
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const key = typeof record.key === "string" ? record.key : typeof record.name === "string" ? record.name : typeof record.label === "string" ? record.label : "";
      return key.trim() ? [key.trim()] : [];
    });
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => key);
  }
  return [];
}

// A category can back hundreds of physical rooms — rendering one row per
// room would be both unusable and pointless (a student reserves "a Double",
// not a specific numbered room). One row per category; reserving auto-picks
// any available bed in that category server-side, same reserve() logic.
export function groupByCategory(
  units: Unit[],
  availableBedsByUnit: Map<string, { id: string; available: boolean }[]>,
  unitPhotos: UnitPhoto[],
  verificationPhotos: ListingPhoto[],
  myLiveBeds: Map<string, "reserved" | "booked">,
  roomAmenitiesByUnit?: RoomAmenitiesByUnit,
): CategoryGroup[] {
  const photosByUnit = new Map<string, LightboxPhoto[]>();
  for (const photo of unitPhotos) {
    const list = photosByUnit.get(photo.unitId) ?? [];
    list.push({ storageKey: photo.storageKey });
    photosByUnit.set(photo.unitId, list);
  }

  const groups = new Map<string, CategoryGroup>();
  for (const unit of units) {
    const key = `${unit.roomCategory}-${unit.selfContained}-${unit.pricePerTermUgx}-${unit.capacity}-${unit.depositUgx ?? "unknown"}`;
    const beds = availableBedsByUnit.get(unit.id) ?? [];
    const availableBeds = beds.filter((b) => b.available);
    const unitPhotoList = photosByUnit.get(unit.id) ?? [];
    const roomAmenities = normalizeRoomAmenities(roomAmenityValue(roomAmenitiesByUnit, unit.id) ?? unit.amenities);
    const existing = groups.get(key);
    if (existing) {
      existing.freeRoomCount += availableBeds.length > 0 ? 1 : 0;
      existing.roomPhotos.push(...unitPhotoList);
      existing.roomAmenities.push(...roomAmenities);
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
        freeRoomCount: availableBeds.length > 0 ? 1 : 0,
        availableCount: availableBeds.length,
        firstAvailableBedId: availableBeds[0]?.id ?? null,
        myStatus: null,
        roomPhotos: [...unitPhotoList],
        roomAmenities,
      });
    }
  }
  // The API's one-per-room-type rule ignores price, so a held bed marks every
  // price row of its category + self-contained type.
  const heldByType = new Map<string, "reserved" | "booked">();
  for (const unit of units) {
    const held = (availableBedsByUnit.get(unit.id) ?? []).map((b) => myLiveBeds.get(b.id)).find(Boolean);
    if (held) heldByType.set(`${unit.roomCategory}-${unit.selfContained}`, held);
  }
  for (const group of groups.values()) {
    group.myStatus = heldByType.get(`${group.category}-${group.selfContained}`) ?? null;
    const verified = photosForRoomType(verificationPhotos, group).map((p) => ({ storageKey: p.storageKey }));
    // A room-type photo is reported once per room of that type; show it once.
    const seen = new Set<string>();
    group.roomPhotos = [...verified, ...group.roomPhotos].filter((p) => !seen.has(p.storageKey) && seen.add(p.storageKey));
    group.roomAmenities = [...new Set(group.roomAmenities)];
  }
  return [...groups.values()].sort((a, b) => Number(b.availableCount > 0) - Number(a.availableCount > 0) || a.pricePerTermUgx - b.pricePerTermUgx);
}

function RoomPhotoPreview({ photos, label }: { photos: LightboxPhoto[]; label: string }) {
  const [failed, setFailed] = useState(false);
  const url = photos[0] ? listingPhotoUrl(photos[0].storageKey, 960) : null;
  const fallback = photos.length > 0 ? "Room photo unavailable" : "No room photo provided";

  return (
    <div className="relative aspect-[16/10] overflow-hidden bg-muted">
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- listing photo storage may be configured at runtime
        <img src={url} alt={`${label} room`} className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
          <Images aria-hidden className="size-7" />
          <span>{fallback}</span>
        </div>
      )}
    </div>
  );
}

type RoomCardProps = {
  group: CategoryGroup;
  listingId: string;
  propertyName: string;
  canReserve: boolean;
  needsProfile: boolean;
  selectedKey?: string;
  onSelect?: (group: CategoryGroup) => void;
  onOpenPhotos: () => void;
  onOpenDetails?: () => void;
};

function RoomActions({ group, listingId, propertyName, canReserve, needsProfile, selectedKey, onSelect, onOpenPhotos, onOpenDetails, publicPresentation }: RoomCardProps & { publicPresentation: boolean }) {
  const label = publicPresentation
    ? roomDisplayLabel(group)
    : `${roomCategoryLabel(group.category)}${group.selfContained ? ", self-contained" : ""}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {group.roomPhotos.length > 0 && (
        <Button type="button" variant="secondary" className="min-h-11" onClick={onOpenPhotos}>
          <Images aria-hidden className="size-4" />
          {publicPresentation ? "View photos" : `Room photos (${group.roomPhotos.length})`}
        </Button>
      )}
      {publicPresentation && onOpenDetails && (
        <Button type="button" variant="link" className="min-h-11 px-1" onClick={onOpenDetails}>
          View details
        </Button>
      )}
      {canReserve && group.myStatus && (
        <Link
          href="/reservations"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-amber-300 px-3 text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-400"
        >
          <CircleCheck aria-hidden className="size-4" />
          {group.myStatus === "booked" ? "Booked" : "Reserved"}
        </Link>
      )}
      {/* Signed out (or not a student): "Reserve" picks the room and the
          summary panel asks them to sign in. A student reserves right here. */}
      {onSelect && !canReserve && (
        <Button
          type="button"
          className="min-h-11"
          disabled={!group.firstAvailableBedId}
          onClick={() => onSelect(group)}
        >
          {selectedKey === group.key ? "Selected" : "Reserve"}
        </Button>
      )}
      {canReserve && !group.myStatus && group.firstAvailableBedId && (
        <ReserveButton
          bedId={group.firstAvailableBedId}
          listingId={listingId}
          needsProfile={needsProfile}
          priceUgx={group.pricePerTermUgx}
          depositUgx={group.depositUgx}
          propertyName={propertyName}
          roomLabel={label}
        />
      )}
    </div>
  );
}

function RoomDetailsDialog({
  group,
  label,
  propertyName,
  open,
  onClose,
  onOpenPhotos,
}: {
  group: CategoryGroup;
  label: string;
  propertyName: string;
  open: boolean;
  onClose: () => void;
  onOpenPhotos: () => void;
}) {
  const bathroom = roomBathroomLabel(group);
  const available = group.availableCount > 0;
  const rentLabel = `${formatUgx(group.pricePerTermUgx)} per bed / semester`;
  const depositLabel = group.depositUgx == null ? "Deposit not stated" : `Deposit ${formatUgx(group.depositUgx)}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      size="lg"
      aria-label={`${label} details`}
    >
      <DialogHeader title={`${label} details`} description={`${propertyName} · room information`} onClose={onClose} />
      <DialogBody className="grid items-start gap-6 md:grid-cols-2">
        <div className="space-y-5">
        <div className="grid gap-3">
          <FeatureIcon icon={Users} label={`Sleeps ${group.capacity}`} className="text-foreground" />
          <FeatureIcon icon={bathroomIcon(group.selfContained)} label={bathroom} className="text-foreground" />
          <FeatureIcon icon={Banknote} label={rentLabel} className="text-foreground" />
          <FeatureIcon icon={Banknote} label={depositLabel} className="text-foreground" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusChip className="shrink-0 whitespace-nowrap" tone={available ? "success" : "warning"}>
            {availabilityLabel(group)}
          </StatusChip>
          <span className="text-sm text-muted-foreground">Availability can change before reservation.</span>
        </div>



        {group.roomAmenities.length > 0 && (
          <section aria-labelledby={`${group.key}-amenities-heading`}>
            <h3 id={`${group.key}-amenities-heading`} className="font-display text-base font-semibold">Room amenities</h3>
            <AmenityList keys={group.roomAmenities} />
          </section>
        )}

        </div>
        <section aria-labelledby={`${group.key}-photos-heading`}>
          <div className="flex items-center justify-between gap-3">
            <h3 id={`${group.key}-photos-heading`} className="font-display text-base font-semibold">Room photos</h3>
            {group.roomPhotos.length > 0 && (
              <Button type="button" variant="link" className="min-h-11 px-1" onClick={() => { onClose(); onOpenPhotos(); }}>
                View all photos
              </Button>
            )}
          </div>
          {group.roomPhotos.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {group.roomPhotos.slice(0, 3).map((photo, index) => (
                <button
                  type="button"
                  key={photo.storageKey}
                  className={`group relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${index === 0 ? "col-span-2" : ""}`}
                  onClick={() => { onClose(); onOpenPhotos(); }}
                >
                  {listingPhotoUrl(photo.storageKey, 640) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- storage URLs are resolved at runtime
                    <img
                      src={listingPhotoUrl(photo.storageKey, 640) ?? undefined}
                      alt={`${label} room photo ${index + 1}`}
                      className="size-full object-cover transition-transform duration-150 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <span className="flex size-full items-center justify-center text-xs text-muted-foreground">Photo unavailable</span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No room photos have been provided.</p>
          )}
        </section>
      </DialogBody>
    </Dialog>
  );
}

function PublicRoomCard(props: RoomCardProps) {
  const { group } = props;
  const label = roomDisplayLabel(group);
  const bathroom = roomBathroomLabel(group);
  const available = group.availableCount > 0;
  const [detailsOpen, setDetailsOpen] = useState(false);
  return (
    <li
      data-room-category={group.category}
      data-room-key={group.key}
      className={`overflow-hidden rounded-xl border bg-card ${selectedClass(group, props.selectedKey)} ${available ? "border-border" : "border-border bg-muted/20"}`}
    >
      <RoomPhotoPreview photos={group.roomPhotos} label={label} />
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-display text-lg font-semibold">{label}</p>
          </div>
          <StatusChip tone={available ? "success" : "warning"}>{availabilityLabel(group)}</StatusChip>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <FeatureIcon icon={Users} label={`Sleeps ${group.capacity}`} />
          <FeatureIcon icon={bathroomIcon(group.selfContained)} label={bathroom} />
        </div>
        <div>
          <p className="tabular font-display text-lg font-semibold text-foreground">{formatUgx(group.pricePerTermUgx)}</p>
          <p className="text-xs text-muted-foreground">
            per bed / semester
            {group.depositUgx != null ? ` · Deposit ${formatUgx(group.depositUgx)}` : " · Deposit unstated"}
          </p>
        </div>
        <RoomActions {...props} publicPresentation onOpenDetails={() => setDetailsOpen(true)} />
      </div>
      <RoomDetailsDialog
        group={group}
        label={label}
        propertyName={props.propertyName}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        onOpenPhotos={props.onOpenPhotos}
      />
    </li>
  );
}

function selectedClass(group: CategoryGroup, selectedKey?: string) {
  return selectedKey === group.key ? "ring-2 ring-inset ring-primary" : "";
}

function LegacyRoomCard(props: RoomCardProps) {
  const { group, selectedKey } = props;
  return (
    <li
      data-room-category={group.category}
      data-room-key={group.key}
      className={`grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5 ${selectedClass(group, selectedKey)}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
          <BedDouble aria-hidden className="size-5" />
        </span>
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-display font-semibold">{roomCategoryLabel(group.category)}</p>
            {group.selfContained && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">Self-contained</span>}
          </div>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span>Sleeps {group.capacity}</span>
            {group.freeRoomCount > 0 && <><span aria-hidden>·</span><span>{group.freeRoomCount} {group.freeRoomCount === 1 ? "room" : "rooms"} free</span></>}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {group.availableCount > 0 ? <StatusChip tone="success">{group.availableCount} {group.availableCount === 1 ? "bed" : "beds"} free</StatusChip> : <StatusChip tone="warning">No beds free right now</StatusChip>}
          </div>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-3 sm:items-end">
        <div className="sm:text-right">
          <p className="tabular whitespace-nowrap font-display text-lg font-semibold text-foreground">{formatUgx(group.pricePerTermUgx)}</p>
          <p className="text-xs text-muted-foreground">per bed / semester{group.depositUgx != null ? ` · Deposit ${formatUgx(group.depositUgx)}` : " · Deposit unstated"}</p>
        </div>
        <RoomActions {...props} publicPresentation={false} />
      </div>
    </li>
  );
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
  myLiveBeds = new Map(),
  roomAmenitiesByUnit,
  selectedKey,
  onSelect,
  publicPresentation = false,
}: {
  listingId: string;
  units: Unit[];
  availability: { id: string; unit_id: string; available: boolean }[];
  photos: ListingPhoto[];
  unitPhotos: UnitPhoto[];
  propertyName: string;
  canReserve: boolean;
  needsProfile: boolean;
  myLiveBeds?: Map<string, "reserved" | "booked">;
  roomAmenitiesByUnit?: RoomAmenitiesByUnit;
  selectedKey?: string;
  onSelect?: (group: CategoryGroup) => void;
  /**
   * Public listing pages deliberately avoid revealing inventory totals. The
   * underlying availability and held-bed calculations remain available to
   * reservation and management callers, which keep the historical display by
   * leaving this opt-in flag off.
   */
  publicPresentation?: boolean;
}) {
  const availableBedsByUnit = new Map<string, { id: string; available: boolean }[]>();
  for (const bed of availability) {
    const list = availableBedsByUnit.get(bed.unit_id) ?? [];
    list.push({ id: bed.id, available: bed.available });
    availableBedsByUnit.set(bed.unit_id, list);
  }
  const groups = groupByCategory(units, availableBedsByUnit, unitPhotos, photos, myLiveBeds, roomAmenitiesByUnit);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  if (groups.length === 0) {
    return (
      <p className="mt-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        Room list is being finalised by our team.
      </p>
    );
  }

  // One section per room type (Single rooms, Double rooms…), each listing its
  // self-contained and non-self-contained variants (Festo, 2026-10-23).
  const sections = ROOM_CATEGORIES.map((category) => ({
    key: category,
    label: `${roomCategoryLabel(category)} rooms`,
    groups: groups.filter((group) => group.category === category),
  })).filter((section) => section.groups.length > 0);

  return (
    <>
      {canReserve && (
        <p className="mt-3 text-sm text-muted-foreground">
          Reserving is free. You can hold up to {MAX_ACTIVE_RESERVATIONS} rooms at a time.
        </p>
      )}
      {publicPresentation ? sections.map((section) => (
        <section key={section.key} className="mt-6 first:mt-4" aria-labelledby={`${section.key}-room-heading`}>
          <h3 id={`${section.key}-room-heading`} className="font-display text-lg font-semibold">{section.label}</h3>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2">
            {section.groups.map((group) => (
              <PublicRoomCard
                key={group.key}
                group={group}
                listingId={listingId}
                propertyName={propertyName}
                canReserve={canReserve}
                needsProfile={needsProfile}
                selectedKey={selectedKey}
                onSelect={onSelect}
                onOpenPhotos={() => setLightbox({ photos: group.roomPhotos, index: 0, caption: `${roomDisplayLabel(group)} room photos` })}
              />
            ))}
          </ul>
        </section>
      )) : (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {groups.map((group) => (
            <LegacyRoomCard
              key={group.key}
              group={group}
              listingId={listingId}
              propertyName={propertyName}
              canReserve={canReserve}
              needsProfile={needsProfile}
              selectedKey={selectedKey}
              onSelect={onSelect}
              onOpenPhotos={() => setLightbox({ photos: group.roomPhotos, index: 0, caption: `${roomCategoryLabel(group.category)}${group.selfContained ? ", self-contained" : ""} room photos` })}
            />
          ))}
        </ul>
      )}

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
