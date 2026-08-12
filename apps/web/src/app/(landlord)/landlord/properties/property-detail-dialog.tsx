"use client";

import { Fragment, useEffect, useState } from "react";
import { BedDouble, Camera, ChevronDown, ChevronUp, X } from "lucide-react";
import type { Property, PropertyDetail } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogHeader } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { StatusChip } from "@/components/status-chip";
import { api, ApiError } from "@/lib/api";
import { listingPhotoUrl, uploadToCloudinary, type CloudinarySignature } from "@/lib/cloudinary";
import { formatUgx } from "@/lib/format";
import { cn } from "@/lib/utils";

const ROOM_CATEGORY_LABEL: Record<string, string> = {
  single: "Single",
  double: "Double",
  triple: "Triple",
  quad: "Quad",
  other: "Other",
};

// ponytail: 3-entry map duplicated from properties-manager.tsx rather than
// exported from it — that file imports this dialog, so sharing the const
// would create a circular import.
const PROPERTY_STATUS_LABEL: Record<string, string> = {
  pending_kyc: "Awaiting verification",
  active: "Active",
  suspended: "Suspended",
};

function RoomStats({
  total,
  available,
  occupied,
  pending,
}: {
  total: number;
  available: number;
  occupied: number;
  pending: number;
}) {
  const items = [
    { label: "Total", value: total, className: "text-foreground" },
    { label: "Available", value: available, className: "text-success" },
    { label: "Occupied", value: occupied, className: "text-foreground" },
    { label: "Pending", value: pending, className: "text-warning" },
  ];
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-1.5">
          <span className={cn("text-lg font-bold tabular-nums", item.className)}>{item.value}</span>
          <span className="text-xs text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
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

function CoverPhoto({ property }: { property: Property }) {
  const url = property.coverPhotoKey ? listingPhotoUrl(property.coverPhotoKey, 800) : null;
  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary-origin storage URL
    <img src={url} alt="" className="h-48 w-full rounded-md object-cover" />
  );
}

function reservationChip(status: PropertyDetail["rooms"][number]["reservationStatus"]) {
  switch (status) {
    case "held":
      return <StatusChip tone="warning">Held</StatusChip>;
    case "payment_pending":
      return <StatusChip tone="warning">Payment pending</StatusChip>;
    case "fulfilled":
      return <StatusChip tone="neutral">Occupied</StatusChip>;
    default:
      return <StatusChip tone="success">Available</StatusChip>;
  }
}

/** Inline expanded panel under a room row — upload a photo for this specific
 * room and remove existing ones. Photos here are separate from the
 * Ops-captured whole-listing gallery above (unit_photos, landlord-writable —
 * the one part of a room a landlord can manage directly, since units
 * themselves stay Ops-only to create/edit). */
function RoomPhotoManager({
  room,
  onPhotosChange,
}: {
  room: PropertyDetail["rooms"][number];
  onPhotosChange: (photos: PropertyDetail["rooms"][number]["photos"]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const sig = await api<CloudinarySignature>("/uploads/sign", { method: "POST" });
      const { publicId } = await uploadToCloudinary(file, sig);
      const created = await api<{ id: string; storageKey: string }>(
        `/listings/units/${room.id}/photos`,
        { method: "POST", body: JSON.stringify({ storageKey: publicId }) },
      );
      onPhotosChange([...room.photos, { id: created.id, storageKey: created.storageKey }]);
    } catch (err) {
      setError(errorMessage(err, "Couldn't upload this photo — try again."));
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove(photoId: string) {
    setError(null);
    setRemovingId(photoId);
    try {
      await api(`/listings/units/photos/${photoId}`, { method: "DELETE" });
      onPhotosChange(room.photos.filter((p) => p.id !== photoId));
    } catch (err) {
      setError(errorMessage(err, "Couldn't remove this photo — try again."));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {room.photos.length > 0 && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {room.photos.map((photo) => {
            const url = listingPhotoUrl(photo.storageKey, 150);
            return (
              <div key={photo.id} className="group relative">
                {url && (
                  // eslint-disable-next-line @next/next/no-img-element -- arbitrary-origin storage URL
                  <img src={url} alt="" className="aspect-square w-full rounded-md object-cover" />
                )}
                <button
                  type="button"
                  aria-label="Remove photo"
                  disabled={removingId === photo.id}
                  onClick={() => handleRemove(photo.id)}
                  className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-100"
                >
                  <X aria-hidden className="size-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-teal-700">
        <Camera aria-hidden className="size-4" />
        {uploading ? "Uploading…" : "Add a photo of this room"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleUpload(file);
          }}
        />
      </label>
    </div>
  );
}

/** Fetches on mount — mounted only while the dialog is open (same pattern as
 * PropertyForm), so every open re-fetches fresh rather than showing stale
 * data from a previous property. */
function PropertyDetailBody({ propertyId }: { propertyId: string }) {
  const [detail, setDetail] = useState<PropertyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<PropertyDetail>(`/listings/properties/${propertyId}/detail`)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this property's rooms — try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  function setRoomPhotos(roomId: string, photos: PropertyDetail["rooms"][number]["photos"]) {
    setDetail((prev) =>
      prev
        ? { ...prev, rooms: prev.rooms.map((r) => (r.id === roomId ? { ...r, photos } : r)) }
        : prev,
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!detail) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const rooms = detail.rooms;
  const stats = {
    total: rooms.length,
    available: rooms.filter((r) => r.reservationStatus === null).length,
    occupied: rooms.filter((r) => r.reservationStatus === "fulfilled").length,
    pending: rooms.filter(
      (r) => r.reservationStatus === "held" || r.reservationStatus === "payment_pending",
    ).length,
  };

  return (
    <div className="space-y-6">
      <RoomStats {...stats} />

      {!detail.listing ? (
        <EmptyState
          icon={BedDouble}
          title="No rooms yet"
          body="Ops adds rooms and photos once this property passes verification and is published."
        />
      ) : (
        <>
          {detail.photos.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
                Verification photos
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {detail.photos.map((storageKey) => {
                  const url = listingPhotoUrl(storageKey, 300);
                  return url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- arbitrary-origin storage URL, same pattern as public listing detail
                    <img
                      key={storageKey}
                      src={url}
                      alt=""
                      className="aspect-square w-full rounded-md object-cover"
                    />
                  ) : null;
                })}
              </div>
            </div>
          )}

          {detail.rooms.length === 0 ? (
            <EmptyState
              icon={BedDouble}
              title="No rooms yet"
              body="Ops adds rooms once this listing is published."
            />
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-3 py-2">Room</th>
                <th scope="col" className="px-3 py-2">Type</th>
                <th scope="col" className="px-3 py-2">Sleeps</th>
                <th scope="col" className="px-3 py-2">Price / semester</th>
                <th scope="col" className="px-3 py-2">Status</th>
                <th scope="col" className="px-3 py-2">Photos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {detail.rooms.map((room) => {
                const expanded = expandedRoomId === room.id;
                return (
                  <Fragment key={room.id}>
                    <tr>
                      <td className="px-3 py-2 font-semibold text-foreground">{room.label}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {ROOM_CATEGORY_LABEL[room.roomCategory] ?? room.roomCategory}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{room.capacity}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatUgx(room.pricePerTermUgx)}
                      </td>
                      <td className="px-3 py-2">{reservationChip(room.reservationStatus)}</td>
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedRoomId(expanded ? null : room.id)}
                        >
                          <Camera aria-hidden className="size-4" />
                          {room.photos.length}
                          {expanded ? (
                            <ChevronUp aria-hidden className="size-3.5" />
                          ) : (
                            <ChevronDown aria-hidden className="size-3.5" />
                          )}
                        </Button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={6} className="bg-muted/10 px-3 py-3">
                          <RoomPhotoManager
                            room={room}
                            onPhotosChange={(photos) => setRoomPhotos(room.id, photos)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
          )}
        </>
      )}
    </div>
  );
}

export function PropertyDetailDialog({
  open,
  onOpenChange,
  property,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: Property | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg">
      {property && (
        <>
          <DialogHeader
            title={property.name}
            description={`${property.streetAddress} · ${PROPERTY_STATUS_LABEL[property.status] ?? property.status}`}
            onClose={() => onOpenChange(false)}
          />
          <DialogBody className="space-y-6">
            <CoverPhoto property={property} />
            <PropertyDetailBody propertyId={property.id} />
          </DialogBody>
        </>
      )}
    </Dialog>
  );
}
