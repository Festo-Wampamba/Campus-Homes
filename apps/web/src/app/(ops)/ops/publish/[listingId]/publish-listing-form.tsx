"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_PUBLISH_UNITS, type Property, type RoomCategory } from "@campushomes/shared";

type PropertyRoom = {
  id: string;
  label: string;
  capacity: number;
  roomCategory: RoomCategory;
  pricePerTermUgx: number | null;
  depositUgx: number | null;
};

import {
  emptyRoomCategoryRow,
  RoomCategoryRows,
  type RoomCategoryRow,
} from "@/components/room-category-rows";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { AMENITY_OPTIONS, ROOM_CATEGORY_DEFAULT_CAPACITY, roomCategoryLabel } from "@/lib/format";

type PublishedVersion = {
  versionNumber: number;
  pricePerTermUgx: number;
  amenities: Record<string, boolean>;
  description: string | null;
  verifiedAt: string;
};

type PublishedPhoto = { id: string; storageKey: string; category: string | null };

type PublishedSnapshot = { version: PublishedVersion; photos: PublishedPhoto[] };

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
      version: PublishedVersion | null;
      photos: PublishedPhoto[];
    }>(`/ops/listings/${listingId}`)
      .then(async ({ listing, property, visitPhotoCount: count, version, photos }) => {
        if (cancelled) return;
        setVisitPhotoCount(count);
        if (listing.status === "verified" && version) {
          setPublished({ version, photos });
          return;
        }

        const rooms = await api<PropertyRoom[]>(
          `/ops/properties/${listing.propertyId}/rooms?semesterId=${listing.semesterId}`,
        ).catch(() => [] as PropertyRoom[]);
        if (cancelled) return;

        if (rooms.length > 0) {
          const groups = new Map<string, RoomCategoryRow>();
          for (const room of rooms) {
            const key = `${room.roomCategory}-${room.pricePerTermUgx ?? "unpriced"}`;
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
                selfContained: false,
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
        `This publish has ${totalRooms} rooms — the maximum per listing is ${MAX_PUBLISH_UNITS}. Reduce the room counts or publish the remaining rooms separately.`,
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
          capacity: ROOM_CATEGORY_DEFAULT_CAPACITY[category] ?? 1,
          roomCategory: category,
          ...(category === "other" && row.customLabel.trim() ? { roomCategoryLabel: row.customLabel.trim() } : {}),
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
        }),
      });
      router.push("/ops");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't publish the listing — try again."));
      setPending(false);
    }
  }

  if (published) {
    const amenities = Object.entries(published.version.amenities)
      .filter(([, on]) => on)
      .map(([key]) => key);
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-input px-3 py-2 text-sm">
          <p className="font-semibold">Published — version {published.version.versionNumber}</p>
          <p className="mt-1 text-muted-foreground">
            Went live on {new Date(published.version.verifiedAt).toLocaleDateString()}. A published
            listing is what students have already seen, so it can&apos;t be edited here. If something
            is wrong, raise a new visit for this property.
          </p>
        </div>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="font-semibold">From</dt>
            <dd className="text-muted-foreground">
              UGX {published.version.pricePerTermUgx.toLocaleString()} per term
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Description</dt>
            <dd className="text-muted-foreground">{published.version.description || "—"}</dd>
          </div>
          <div>
            <dt className="font-semibold">Amenities</dt>
            <dd className="text-muted-foreground">
              {amenities.length > 0
                ? amenities
                    .map((key) => AMENITY_OPTIONS.find((a) => a.key === key)?.label ?? key)
                    .join(", ")
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Photos ({published.photos.length})</dt>
            <dd className="text-muted-foreground">
              {published.photos.length === 0 ? (
                "No verification photos were published with this listing."
              ) : (
                <ul className="mt-1 space-y-1">
                  {published.photos.map((photo) => (
                    <li key={photo.id} className="flex items-center gap-2">
                      <span className="truncate">{photo.storageKey}</span>
                      <span className="shrink-0 rounded bg-muted px-1 text-xs">
                        {photo.category ?? "uncategorised"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {visitPhotoCount === 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          The inspector didn&apos;t stage any photos on this visit — publishing now
          will go live with no verification photos. You can still publish, but
          consider getting photos from the inspector first.
        </p>
      )}
      <div className="space-y-1.5">
        <Label>Room types & pricing</Label>
        <p className="text-xs text-muted-foreground">
          Each room type is published as that many individual units at that
          price — confirm these against what you saw on the inspection visit.
        </p>
        <RoomCategoryRows
          rows={roomCategoryRows}
          onChange={setRoomCategoryRows}
          idPrefix="publish-room"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Amenities</Label>
        <div className="grid grid-cols-2 gap-2">
          {AMENITY_OPTIONS.map((option) => (
            <label key={option.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={amenities[option.key] ?? false}
                onChange={(e) =>
                  setAmenities((prev) => ({ ...prev, [option.key]: e.target.checked }))
                }
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Publishing…" : "Publish listing"}
      </Button>
      <p role="status" className="min-h-5 text-sm text-destructive">
        {error}
      </p>
    </form>
  );
}
