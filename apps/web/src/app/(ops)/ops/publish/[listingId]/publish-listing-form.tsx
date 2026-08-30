"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Property, RoomCategory } from "@campushomes/shared";

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

  // Pre-fill from the landlord's proposed room categories (submitted at
  // onboarding) so Ops confirms/adjusts real inspection numbers instead of
  // typing every listing from a blank form.
  useEffect(() => {
    let cancelled = false;
    api<{ property: Property; visitPhotoCount: number }>(`/ops/listings/${listingId}`)
      .then(({ property, visitPhotoCount: count }) => {
        if (cancelled) return;
        setVisitPhotoCount(count);
        if (!property.proposedRoomCategories?.length) return;
        setRoomCategoryRows(
          property.proposedRoomCategories.map((p) => ({
            key: `prefill-${p.category}-${p.pricePerTermUgx}-${Math.random()}`,
            category: p.category,
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

    setPending(true);
    try {
      const units = validRows.flatMap((row) => {
        const category = row.category as RoomCategory;
        const count = Number(row.roomCount);
        const price = Number(row.pricePerTermUgx);
        const deposit = row.depositUgx ? Number(row.depositUgx) : undefined;
        return Array.from({ length: count }, (_, i) => ({
          label: `${roomCategoryLabel(category)} ${i + 1}`,
          capacity: ROOM_CATEGORY_DEFAULT_CAPACITY[category] ?? 1,
          roomCategory: category,
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
