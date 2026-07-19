"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { UNIVERSITIES, type Property, type University } from "@campushomes/shared";

import { RoomCategoryRows, emptyRoomCategoryRow, type RoomCategoryRow } from "@/components/room-category-rows";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { listingPhotoUrl, uploadToCloudinary, type CloudinarySignature } from "@/lib/cloudinary";
import { AMENITY_OPTIONS, humanizeKey } from "@/lib/format";
import { cn } from "@/lib/utils";

const UNIVERSITY_LABELS: Record<University, string> = {
  MUK: "Makerere University",
  MUBS: "Makerere University Business School",
  KIU: "Kampala International University",
  KYU: "Kyambogo University",
  other: "Other / not listed",
};

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null;
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join(", ");
  }
  return fallback;
}

function roomRowsFromProperty(property: Property | null): RoomCategoryRow[] {
  if (!property?.proposedRoomCategories) return [];
  return property.proposedRoomCategories.map((row) => ({
    ...emptyRoomCategoryRow(),
    category: row.category,
    roomCount: String(row.roomCount),
    pricePerTermUgx: String(row.pricePerTermUgx),
  }));
}

/** Owns all the field state. Mounted only while the dialog is open (Dialog's
 * `{open && children}` guard), so every open is a fresh mount with state
 * freshly derived from `property` — no effect needed to "reset" anything. */
function PropertyForm({
  property,
  onOpenChange,
  onSaved,
}: {
  property: Property | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isEdit = property != null;
  const [name, setName] = useState(property?.name ?? "");
  const [streetAddress, setStreetAddress] = useState(property?.streetAddress ?? "");
  const [catchment, setCatchment] = useState<University>(property?.catchment ?? "MUK");
  const [roomCategoryRows, setRoomCategoryRows] = useState<RoomCategoryRow[]>(
    roomRowsFromProperty(property),
  );
  const [amenities, setAmenities] = useState<Record<string, boolean>>(
    property?.proposedAmenities ?? {},
  );
  const [customAmenity, setCustomAmenity] = useState("");
  const [coverPhotoFile, setCoverPhotoFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const knownAmenityKeys = useMemo(() => new Set(AMENITY_OPTIONS.map((o) => o.key)), []);
  const customAmenityKeys = Object.keys(amenities).filter(
    (key) => amenities[key] && !knownAmenityKeys.has(key),
  );

  function addCustomAmenity() {
    const key = customAmenity.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (!key) return;
    setAmenities((prev) => ({ ...prev, [key]: true }));
    setCustomAmenity("");
  }

  function removeAmenity(key: string) {
    setAmenities((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  // New file picked -> local blob preview; otherwise fall back to whatever
  // cover photo is already saved. Revoked on change/unmount so we don't leak
  // object URLs across repeated picks in one session.
  const coverPhotoPreview = useMemo(() => {
    if (coverPhotoFile) return URL.createObjectURL(coverPhotoFile);
    return property?.coverPhotoKey ? listingPhotoUrl(property.coverPhotoKey, 150) : null;
  }, [coverPhotoFile, property]);

  useEffect(() => {
    return () => {
      if (coverPhotoFile && coverPhotoPreview) URL.revokeObjectURL(coverPhotoPreview);
    };
  }, [coverPhotoFile, coverPhotoPreview]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      let newCoverPhotoKey: string | undefined;
      if (coverPhotoFile) {
        const sig = await api<CloudinarySignature>("/uploads/sign", { method: "POST" });
        const { publicId } = await uploadToCloudinary(coverPhotoFile, sig);
        newCoverPhotoKey = publicId;
      }
      const proposedRoomCategories = roomCategoryRows
        .filter((row) => Number(row.roomCount) > 0 && Number(row.pricePerTermUgx) > 0)
        .map((row) => ({
          category: row.category,
          roomCount: Number(row.roomCount),
          pricePerTermUgx: Number(row.pricePerTermUgx),
        }));
      const body = JSON.stringify({
        name,
        streetAddress,
        catchment,
        proposedRoomCategories,
        proposedAmenities: amenities,
        // Omitted entirely when no new file was picked — for an edit, that
        // leaves the existing cover photo untouched instead of clearing it.
        ...(newCoverPhotoKey ? { coverPhotoKey: newCoverPhotoKey } : {}),
      });
      if (isEdit) {
        await api(`/listings/properties/${property.id}`, { method: "PATCH", body });
      } else {
        await api("/listings/properties", { method: "POST", body });
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err, `Couldn't save this property — try again.`));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <DialogHeader
        title={isEdit ? "Edit property" : "Add a property"}
        description={
          isEdit
            ? "Changes apply immediately — Ops sees the latest details at your next visit."
            : "Our Ops team schedules a physical verification visit once this is submitted."
        }
        onClose={() => onOpenChange(false)}
      />
      <DialogBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="property-name">Property name</Label>
            <Input
              id="property-name"
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sunrise Hostel"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="property-address">Street address</Label>
            <Input
              id="property-address"
              required
              minLength={3}
              value={streetAddress}
              onChange={(e) => setStreetAddress(e.target.value)}
              placeholder="Street, area, city"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="property-catchment">Nearest university</Label>
            <select
              id="property-catchment"
              value={catchment}
              onChange={(e) => setCatchment(e.target.value as University)}
              className={cn(
                "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs transition-colors duration-150",
                "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10",
              )}
            >
              {UNIVERSITIES.map((code) => (
                <option key={code} value={code}>
                  {UNIVERSITY_LABELS[code]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="property-photo">Cover photo (optional)</Label>
            <div className="flex items-center gap-3">
              {coverPhotoPreview && (
                // eslint-disable-next-line @next/next/no-img-element -- local blob preview or arbitrary-origin storage URL
                <img
                  src={coverPhotoPreview}
                  alt=""
                  className="size-11 shrink-0 rounded-md object-cover"
                />
              )}
              <Input
                id="property-photo"
                type="file"
                accept="image/*"
                onChange={(e) => setCoverPhotoFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Room types & pricing (optional)</Label>
            <p className="text-xs text-muted-foreground">
              e.g. 30 singles at UGX 300,000, 40 doubles at UGX 700,000. Ops
              confirms exact pricing and room counts during verification.
            </p>
            <RoomCategoryRows
              rows={roomCategoryRows}
              onChange={setRoomCategoryRows}
              idPrefix={isEdit ? `edit-${property.id}` : "add-property"}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Amenities (optional)</Label>
            <p className="text-xs text-muted-foreground">
              What the property offers — Ops confirms these during
              verification.
            </p>
            <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3">
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
            {customAmenityKeys.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {customAmenityKeys.map((key) => (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground"
                  >
                    {humanizeKey(key)}
                    <button
                      type="button"
                      aria-label={`Remove ${humanizeKey(key)}`}
                      onClick={() => removeAmenity(key)}
                    >
                      <X aria-hidden className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={customAmenity}
                onChange={(e) => setCustomAmenity(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomAmenity();
                  }
                }}
                placeholder="Add a custom amenity…"
                className="h-9"
              />
              <Button type="button" variant="secondary" size="sm" onClick={addCustomAmenity}>
                Add
              </Button>
            </div>
          </div>
        </div>
        <p aria-live="polite" role="status" className="min-h-5 text-sm text-destructive">
          {error}
        </p>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Add property"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Create or edit a property — same dialog either way (DESIGN.md: portals
 * differ by data, not by dialect). `property` present = edit; absent = add. */
export function PropertyFormDialog({
  open,
  onOpenChange,
  property,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: Property | null;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg">
      <PropertyForm property={property} onOpenChange={onOpenChange} onSaved={onSaved} />
    </Dialog>
  );
}
