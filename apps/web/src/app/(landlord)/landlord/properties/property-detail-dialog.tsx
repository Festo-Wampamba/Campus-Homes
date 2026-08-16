"use client";

import { Fragment, useEffect, useState } from "react";
import { BedDouble, Camera, ChevronDown, ChevronUp, X } from "lucide-react";
import type { Property, PropertyDetail, TenantAgreementForPropertyRow } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogHeader } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { PropertyQrCode } from "@/components/property-qr-code";
import { StatusChip } from "@/components/status-chip";
import { TenantAgreementBuilderDialog } from "@/components/tenant-agreement-builder-dialog";
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

/** Read-only — self-serve submissions, nothing for the landlord to approve
 * here (see tenant-agreements.service.ts). Fetches on mount, same pattern
 * as PropertyDetailBody. Each row expands to show every answer plus the
 * signature (drawn image, or the typed name is already the header). */
function TenantAgreementsList({ propertyId }: { propertyId: string }) {
  const [agreements, setAgreements] = useState<TenantAgreementForPropertyRow[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<TenantAgreementForPropertyRow[]>(`/tenant-agreements/property/${propertyId}`)
      .then((rows) => {
        if (!cancelled) setAgreements(rows);
      })
      .catch(() => {
        if (!cancelled) setAgreements([]);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  if (!agreements || agreements.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
        Tenant agreements ({agreements.length})
      </p>
      <div className="divide-y divide-border rounded-md border border-border">
        {agreements.map((a) => {
          const expanded = expandedId === a.id;
          const signatureUrl =
            a.signature_type === "drawn" && a.signature_storage_key
              ? listingPhotoUrl(a.signature_storage_key, 300)
              : null;
          return (
            <div key={a.id}>
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : a.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">
                    {a.signed_name ?? a.student_name ?? "Unnamed student"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Signed{" "}
                    {new Date(a.submitted_at).toLocaleDateString([], {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                    {a.signature_type === "drawn" ? " · drawn signature" : ""}
                  </p>
                </div>
                {expanded ? (
                  <ChevronUp aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                )}
              </button>
              {expanded && (
                <div className="space-y-3 border-t border-border bg-muted/30 px-3 py-3">
                  {a.responses.map((r) => (
                    <div key={r.fieldId}>
                      <p className="text-xs font-semibold text-muted-foreground">{r.label}</p>
                      <p className="text-sm text-foreground">
                        {Array.isArray(r.value) ? r.value.join(", ") : r.value}
                      </p>
                    </div>
                  ))}
                  {signatureUrl && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground">Signature</p>
                      {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary-origin storage URL */}
                      <img
                        src={signatureUrl}
                        alt="Drawn signature"
                        className="mt-1 h-16 rounded-md border border-border bg-white"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
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
  const [semesters, setSemesters] = useState<{ id: string; name: string }[]>([]);
  const [semesterId, setSemesterId] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

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

  // Only needed once we know the property has no listing yet — no point
  // fetching semesters for a property that already has one.
  useEffect(() => {
    if (!detail || detail.listing) return;
    let cancelled = false;
    api<{ id: string; name: string }[]>(`/listings/semesters?catchment=${detail.property.catchment}`)
      .then((rows) => {
        if (cancelled) return;
        setSemesters(rows ?? []);
        setSemesterId((rows ?? [])[0]?.id ?? "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [detail]);

  async function requestListing() {
    if (!semesterId) return;
    setRequesting(true);
    setRequestError(null);
    try {
      await api(`/listings/drafts`, {
        method: "POST",
        body: JSON.stringify({ propertyId, semesterId }),
      });
      const refreshed = await api<PropertyDetail>(`/listings/properties/${propertyId}/detail`);
      setDetail(refreshed);
    } catch (err) {
      setRequestError(errorMessage(err, "Couldn't request a listing — try again."));
    } finally {
      setRequesting(false);
    }
  }

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

      {detail.listing && detail.listing.status !== "verified" && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {detail.listing.status === "draft"
            ? "This listing is a draft — it won't appear in student search until Ops schedules and completes a verification visit and publishes it."
            : `Listing status: ${detail.listing.status.replaceAll("_", " ")} — not yet visible in student search.`}
        </div>
      )}
      {!detail.listing ? (
        <div className="space-y-3">
          <EmptyState
            icon={BedDouble}
            title="No listing yet"
            body="Request a listing for a semester so Ops can schedule your verification visit and publish it."
          />
          {semesters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={semesterId}
                onChange={(e) => setSemesterId(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              >
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <Button type="button" onClick={requestListing} disabled={requesting}>
                {requesting ? "Requesting…" : "Request listing"}
              </Button>
            </div>
          )}
          {requestError && <p className="text-sm text-destructive">{requestError}</p>}
        </div>
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
                <th scope="col" className="px-3 py-2">Deposit</th>
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
                      <td className="px-3 py-2 text-muted-foreground">
                        {room.depositUgx != null ? formatUgx(room.depositUgx) : "—"}
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
  const [builderOpen, setBuilderOpen] = useState(false);

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
            <div className="flex flex-col gap-3 rounded-md border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Tenant agreement form</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Design the form students fill out and sign after scanning this property&apos;s QR code.
                </p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => setBuilderOpen(true)}>
                Edit form
              </Button>
            </div>
            <PropertyQrCode propertyId={property.id} propertyName={property.name} />
            <TenantAgreementsList propertyId={property.id} />
            <PropertyDetailBody propertyId={property.id} />
          </DialogBody>
          <TenantAgreementBuilderDialog
            open={builderOpen}
            onOpenChange={setBuilderOpen}
            propertyId={property.id}
            propertyName={property.name}
          />
        </>
      )}
    </Dialog>
  );
}
