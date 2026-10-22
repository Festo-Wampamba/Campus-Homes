"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_PUBLISH_UNITS, PHOTO_CATEGORIES, withAmenity, type PhotoCategory, type Property, type RoomCategory, type VisitPhoto } from "@campushomes/shared";

type PropertyRoom = {
  id: string;
  label: string;
  capacity: number;
  roomCategory: RoomCategory;
  selfContained: boolean;
  pricePerTermUgx: number | null;
  depositUgx: number | null;
};

import {
  bedsPerRoom,
  emptyRoomCategoryRow,
  RoomCategoryRows,
  type RoomCategoryRow,
} from "@/components/room-category-rows";
import { PhotoSetEditor } from "@/components/ops/photo-set-editor";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { amenityGroups, declaredAmenityState, type DeclaredChecklists } from "@/lib/amenity-confirmation";
import { roomCategoryLabel } from "@/lib/format";

type PublishedVersion = {
  versionNumber: number;
  pricePerTermUgx: number;
  amenities: Record<string, boolean>;
  description: string | null;
  verifiedAt: string;
};

type PublishedPhoto = {
  id: string;
  storageKey: string;
  category: PhotoCategory | null;
  customLabel: string | null;
  selfContained: boolean | null;
  roomCategory: RoomCategory | null;
};

type PublishedSnapshot = { version: PublishedVersion; photos: PublishedPhoto[] };

/** Photos the landlord attached to each room type in the property form,
 * pre-linked to that room type so the lead only confirms or removes them. */
function landlordRoomTypePhotos(property: Property, staged: VisitPhoto[]): VisitPhoto[] {
  const seen = new Set(staged.map((p) => p.storageKey));
  return (property.proposedRoomCategories ?? []).flatMap((row) =>
    (row.photoKeys ?? []).filter((key) => !seen.has(key) && seen.add(key)).map((storageKey) => {
      const bedroom = `${row.category}_bedroom` as PhotoCategory;
      return {
        storageKey,
        category: PHOTO_CATEGORIES.includes(bedroom) ? bedroom : ("bedroom" as const),
        roomCategory: row.category,
        selfContained: row.selfContained ?? false,
      };
    }),
  );
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null;
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join(", ");
  }
  return fallback;
}

export function PublishListingForm({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [amenities, setAmenities] = useState<Record<string, boolean>>({});
  const [declared, setDeclared] = useState<DeclaredChecklists | null>(null);
  // null until loaded, so a failed load never sends an empty set that would
  // strip the listing's photos.
  const [photos, setPhotos] = useState<VisitPhoto[] | null>(null);
  const [roomCategoryRows, setRoomCategoryRows] = useState<RoomCategoryRow[]>([
    emptyRoomCategoryRow(),
  ]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visitPhotoCount, setVisitPhotoCount] = useState<number | null>(null);
  // Set once the listing is already live. publishListing() rejects a second
  // publish, so a verified listing is shown read-only rather than as a form
  // whose only possible outcome is a 409.
  const [published, setPublished] = useState<PublishedSnapshot | null>(null);

  // Rooms are permanent/property-level (2026-09) — once a property has real
  // rooms, they're what gets pre-filled here (grouped by category+price,
  // carrying their unitIds so submit() reuses them instead of creating
  // duplicates); only a property with no rooms yet falls back to the
  // landlord's proposed categories from onboarding, same as before.
  useEffect(() => {
    let cancelled = false;
    api<{
      listing: { propertyId: string; semesterId: string; status: string };
      property: Property;
      visitPhotoCount: number;
      visitPhotos: VisitPhoto[];
      version: PublishedVersion | null;
      photos: PublishedPhoto[];
    }>(`/ops/listings/${listingId}`)
      .then(async ({ listing, property, visitPhotoCount: count, visitPhotos, version, photos: livePhotos }) => {
        if (cancelled) return;
        setVisitPhotoCount(count);
        setDeclared(property);
        // First publish starts from what the landlord declared; Ops unticks
        // anything the visit didn't confirm. A live listing keeps its own
        // confirmed set (below).
        setAmenities(declaredAmenityState(property));
        // First publish starts from the landlord's own description; the lead edits it.
        setDescription(property.description ?? "");
        setPhotos([...visitPhotos, ...landlordRoomTypePhotos(property, visitPhotos)]);
        if (listing.status === "verified" && version) {
          // Re-opening a live listing to edit it: keep the published snapshot
          // for the banner, pre-fill amenities/description from it, then fall
          // through to load the rooms so the whole form is editable. Saving
          // creates a new version and stays verified (photos carried server-side).
          setPublished({ version, photos: livePhotos });
          setPhotos(livePhotos.map((p) => ({
            storageKey: p.storageKey,
            category: p.category ?? "other",
            ...(p.customLabel ? { label: p.customLabel } : {}),
            ...(p.selfContained != null ? { selfContained: p.selfContained } : {}),
            ...(p.roomCategory ? { roomCategory: p.roomCategory } : {}),
          })));
          setDescription(version.description ?? "");
          setAmenities(version.amenities ?? {});
        }

        const rooms = await api<PropertyRoom[]>(
          `/ops/properties/${listing.propertyId}/rooms?semesterId=${listing.semesterId}`,
        ).catch(() => [] as PropertyRoom[]);
        if (cancelled) return;

        if (rooms.length > 0) {
          const groups = new Map<string, RoomCategoryRow>();
          for (const room of rooms) {
            const key = `${room.roomCategory}-${room.capacity}-${room.pricePerTermUgx ?? "unpriced"}-${room.selfContained}`;
            const existing = groups.get(key);
            if (existing) {
              existing.roomCount = String(Number(existing.roomCount) + 1);
              existing.unitIds!.push(room.id);
            } else {
              groups.set(key, {
                key,
                category: room.roomCategory,
                // ponytail: existing-room prefill drops any custom label (rare
                // for 'other' rooms); the lead can retype it. Wire through
                // PropertyRoom when that becomes a real need.
                customLabel: "",
                roomCount: "1",
                pricePerTermUgx: room.pricePerTermUgx != null ? String(room.pricePerTermUgx) : "",
                depositUgx: room.depositUgx != null ? String(room.depositUgx) : "",
                selfContained: room.selfContained,
                bedsPerRoom: String(room.capacity),
                unitIds: [room.id],
              });
            }
          }
          setRoomCategoryRows([...groups.values()]);
          return;
        }

        if (!property.proposedRoomCategories?.length) return;
        setRoomCategoryRows(
          property.proposedRoomCategories.map((p) => ({
            key: `prefill-${p.category}-${p.pricePerTermUgx}-${Math.random()}`,
            category: p.category,
            customLabel: "",
            roomCount: String(p.roomCount),
            pricePerTermUgx: String(p.pricePerTermUgx),
            depositUgx: p.depositUgx != null ? String(p.depositUgx) : "",
            selfContained: p.selfContained ?? false,
            bedsPerRoom: p.bedsPerRoom != null ? String(p.bedsPerRoom) : undefined,
          })),
        );
      })
      .catch(() => {
        // Prefill is a convenience, not a requirement — the form still works blank.
      });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validRows = roomCategoryRows.filter(
      (row) => Number(row.roomCount) > 0 && Number(row.pricePerTermUgx) > 0,
    );
    if (validRows.length === 0) {
      setError("Add at least one room type with a room count and price.");
      return;
    }

    const totalRooms = validRows.reduce((sum, row) => sum + Number(row.roomCount), 0);
    if (totalRooms > MAX_PUBLISH_UNITS) {
      setError(
        `This publish has ${totalRooms} rooms. The maximum per listing is ${MAX_PUBLISH_UNITS}. Reduce the room counts or publish the remaining rooms separately.`,
      );
      return;
    }

    setPending(true);
    try {
      const units = validRows.flatMap((row) => {
        const category = row.category as RoomCategory;
        const count = Number(row.roomCount);
        const price = Number(row.pricePerTermUgx);
        const deposit = row.depositUgx ? Number(row.depositUgx) : undefined;
        return Array.from({ length: count }, (_, i) => ({
          // Present = reuse this existing room, just price it for this
          // semester; absent = a brand-new physical room. label/capacity are
          // ignored server-side when unitId is present (a room's own
          // physical details don't change on repricing).
          ...(row.unitIds?.[i] ? { unitId: row.unitIds[i] } : {}),
          label: `${roomCategoryLabel(category)} ${i + 1}`,
          capacity: bedsPerRoom(row),
          roomCategory: category,
          ...(category === "other" && row.customLabel.trim() ? { roomCategoryLabel: row.customLabel.trim() } : {}),
          selfContained: row.selfContained,
          pricePerTermUgx: price,
          ...(deposit ? { depositUgx: deposit } : {}),
        }));
      });
      await api("/ops/listings/publish", {
        method: "POST",
        body: JSON.stringify({
          listingId,
          amenities,
          description: description || undefined,
          units,
          ...(photos ? { photos } : {}),
        }),
      });
      router.push("/ops");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't publish the listing. Try again."));
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {published && (
        <div className="rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
          <p className="font-semibold">
            Editing a live listing. Version {published.version.versionNumber} (verified{" "}
            {new Date(published.version.verifiedAt).toLocaleDateString()})
          </p>
          <p className="mt-1 text-muted-foreground">
            Saving creates a new version and the listing stays verified and visible to students.
            Its photos are listed below; any changes to them apply when you save.
            Removing a room row (or lowering its count) deletes those rooms. Only allowed if they
            have no reservations.
          </p>
        </div>
      )}
      {published === null && visitPhotoCount === 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          The inspector didn&apos;t stage any photos on this visit. Add photos
          below, or the listing will go live without any.
        </p>
      )}
      <div className="space-y-1.5">
        <Label>Room types & pricing</Label>
        <p className="text-xs text-muted-foreground">
          Each room type is published as that many individual units at that
          price. Confirm these against what you saw on the inspection visit.
        </p>
        <RoomCategoryRows
          rows={roomCategoryRows}
          onChange={setRoomCategoryRows}
          showSelfContained
          showBeds
          idPrefix="publish-room"
        />
      </div>
      {photos && <PhotoSetEditor photos={photos} onChange={setPhotos} />}
      <AmenityConfirmation
        groups={amenityGroups(declared)}
        value={amenities}
        onToggle={(key, checked) => setAmenities((prev) => withAmenity(prev, key, checked))}
      />
      <div className="space-y-1.5">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending
          ? published
            ? "Saving…"
            : "Publishing…"
          : published
            ? "Save changes"
            : "Publish listing"}
      </Button>
      <p role="status" className="min-h-5 text-sm text-destructive">
        {error}
      </p>
    </form>
  );
}

function AmenityConfirmation({
  groups,
  value,
  onToggle,
}: {
  groups: ReturnType<typeof amenityGroups>;
  value: Record<string, boolean>;
  onToggle: (key: string, checked: boolean) => void;
}) {
  const others = groups.flatMap((g) => g.others);
  const checkbox = (option: { key: string; label: string }) => (
    <label key={option.key} className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={value[option.key] ?? false}
        onChange={(e) => onToggle(option.key, e.target.checked)}
      />
      {option.label}
    </label>
  );
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Amenities</legend>
      <p className="text-xs text-muted-foreground">
        Ticked items are what the landlord declared. Untick anything the inspection didn&apos;t
        confirm. Only ticked items appear on the listing.
      </p>
      {groups.map((group) => (
        <div key={group.title} className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.title}
          </p>
          {group.declared.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">{group.declared.map(checkbox)}</div>
          ) : (
            <p className="text-sm text-muted-foreground">The landlord declared none.</p>
          )}
        </div>
      ))}
      {others.length > 0 && (
        <details className="rounded-md border border-border px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">
            Add something the landlord didn&apos;t list
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-2">{others.map(checkbox)}</div>
        </details>
      )}
    </fieldset>
  );
}
