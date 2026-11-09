"use client";

import NextImage from "next/image";
import { useEffect, useRef, useState } from "react";
import { prepareRoomPhoto } from "./room-photo-file";
import { Camera, Check, ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { roomCategoryLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, apiErrorMessage } from "@/lib/api";
import { listingPhotoUrl, uploadToCloudinary, type CloudinarySignature } from "@/lib/cloudinary";
import {
  BATHROOM_TYPE_LABELS,
  type BathroomType,
  type RoomType,
  type RoomTypePhoto,
} from "@/lib/room-management";
import { normalizeRoomTypeName, SELECTABLE_ROOM_CATEGORIES, type RoomCategory } from "@campushomes/shared";

interface RoomTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  semesterId: string;
  roomType?: RoomType | null;
  roomTypes: RoomType[];
  onSaved: (savedType: RoomType) => void;
}

const COMMON_AMENITIES = [
  "Wi-Fi",
  "Hot Water",
  "Reading desk",
  "Chair",
  "Bed",
  "Mattress",
  "Dressing mirror",
  "Wardrobe",
  "Balcony",
  "Ceiling Fan",
  "Refrigerator",
  "Shoe Rack",
  "Mosquito Net",
  "Curtains",
  "Full Length Mirror",
  "Private Kitchenette",
];

export function RoomTypeDialog({
  open,
  onOpenChange,
  propertyId,
  semesterId,
  roomType,
  roomTypes,
  onSaved,
}: RoomTypeDialogProps) {
  const current = roomType?.pendingVersion ?? roomType?.currentVersion;

  const [title, setTitle] = useState(current?.title ?? "");
  const [category, setCategory] = useState<RoomCategory>(
    (current?.category as RoomCategory) ?? "single",
  );
  const [bathroomType, setBathroomType] = useState<BathroomType>(
    current?.bathroomType ?? "ensuite",
  );
  const [capacity, setCapacity] = useState<number>(current?.capacity ?? 1);
  const [pricePerTermUgx, setPricePerTermUgx] = useState<string>(
    current?.pricePerTermUgx ? String(current.pricePerTermUgx) : "",
  );
  const [depositUgx, setDepositUgx] = useState<string>(
    current?.depositUgx ? String(current.depositUgx) : "",
  );
  const [sizeSqm, setSizeSqm] = useState<string>(
    current?.sizeSqm ? String(current.sizeSqm) : "",
  );
  const [description, setDescription] = useState(current?.description ?? "");
  const [amenities, setAmenities] = useState<string[]>(() => Array.from(new Set((current?.amenities ?? []).flatMap((item) => item === "Reading Desk & Chair" ? ["Reading desk", "Chair"] : [item]))));
  const [photos, setPhotos] = useState<RoomTypePhoto[]>(current?.photos ?? []);

  const photoInput = useRef<HTMLInputElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (error) errorBox.current?.scrollIntoView?.({ block: "nearest" }); }, [error]);

  const sameNameTypes = roomTypes.filter((type) => type.id !== roomType?.id &&
    [type.currentVersion, type.pendingVersion].some((version) => version && normalizeRoomTypeName(version.title) === normalizeRoomTypeName(title)));
  const needsDescription = sameNameTypes.length > 0;
  const amenityOptions = Array.from(new Set([...COMMON_AMENITIES, ...amenities]));

  function toggleAmenity(item: string) {
    setAmenities((prev) =>
      prev.includes(item) ? prev.filter((a) => a !== item) : [...prev, item],
    );
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.currentTarget.files ?? []);
    e.currentTarget.value = "";
    setPhotoError(null);
    if (!files.length) return;

    if (photos.length + files.length > 10) {
      setPhotoError("You can upload a maximum of 10 photos per room type.");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      for (const selected of files) {
        const file = await prepareRoomPhoto(selected);
        const sig = await api<CloudinarySignature>("/uploads/sign", {
          method: "POST",
          body: JSON.stringify({ folder: `properties/${propertyId}/room-types`, contentType: file.type, size: file.size }),
        });

        const { publicId } = await uploadToCloudinary(file, sig);

        setPhotos((prev) => [
          ...prev,
          {
            id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            storageKey: publicId,
            sortOrder: prev.length,
            isPrimary: prev.length === 0,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      setPhotoError(err instanceof Error && !("status" in err) ? err.message : apiErrorMessage(err, "Photo upload failed. Please try again."));
    } finally {
      setUploading(false);
    }
  }

  function setPrimaryPhoto(id: string) {
    setPhotos((prev) =>
      prev.map((p) => ({
        ...p,
        isPrimary: p.id === id,
      })),
    );
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const remaining = prev.filter((p) => p.id !== id);
      if (remaining.length > 0 && !remaining.some((p) => p.isPrimary)) {
        remaining[0].isPrimary = true;
      }
      return remaining.map((p, idx) => ({ ...p, sortOrder: idx }));
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (uploading) { setPhotoError("Wait for the photo upload to finish before saving."); return; }
    setError(null);

    const price = Number(pricePerTermUgx.replace(/[^0-9]/g, ""));
    if (!price || price <= 0) {
      setError("Please enter a valid price per bed per semester.");
      return;
    }

    if (needsDescription && !description.trim()) {
      setError("This name is already used. Describe what makes this room type different, such as size, price or features.");
      return;
    }

    const deposit = depositUgx ? Number(depositUgx.replace(/[^0-9]/g, "")) : null;

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim() || `${category.toUpperCase()} Room`,
        category,
        bathroomType,
        capacity: Number(capacity),
        sizeSqm: sizeSqm ? Number(sizeSqm) : null,
        description: description.trim() || null,
        amenities,
        semesterId,
        pricePerTermUgx: price,
        depositUgx: deposit,
        photos,
      };

      let result: RoomType;
      if (roomType?.id) {
        result = await api<RoomType>(`/room-management/room-types/${roomType.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        result = await api<RoomType>(
          `/room-management/properties/${propertyId}/room-types`,
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
        );
      }

      onSaved(result);
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not save room type."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="xl" resizable dismissible={false}>
      {/* min-h-0 + flex-auto (not flex-1: iOS Safari collapses a zero basis) let DialogBody scroll inside the dialog's max height,
          so the photos section and Save button are always reachable. */}
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-auto flex-col">
        <DialogHeader
          title={roomType ? "Edit room type" : "Create room type"}
          className="gap-2 p-3 sm:p-5"
          onClose={() => { if (!uploading && !submitting) onOpenChange(false); }}
        />

        <DialogBody className="space-y-6">
          <p className="text-sm text-muted-foreground">Define the room category, bathroom type, sleeping capacity, amenities, and price per bedspace per semester.</p>
          {error && (
            <div
              ref={errorBox}
              role="alert"
              className="rounded-lg border border-destructive/20 bg-destructive-subtle p-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          <div className="ch-auto-grid gap-4">
            <div>
              <Label htmlFor="rt-title">Room Type Display Name</Label>
              <Input
                id="rt-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Standard Double Ensuite"
                required
                className="mt-1.5"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Name used to identify this specification in your inventory.
              </p>
            </div>

            <div>
              <Label htmlFor="rt-category">Room Category</Label>
              <select
                id="rt-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as RoomCategory)}
                className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
              >
                {/* Bathroom arrangement below covers self-contained; keep the
                    option only for a room type that already uses it. */}
                {[...SELECTABLE_ROOM_CATEGORIES, ...(category === "bedsitter" ? ["bedsitter" as const] : [])].filter((cat) => cat !== "self_contained" || cat === category).map((cat) => (
                  <option key={cat} value={cat}>
                    {roomCategoryLabel(cat)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="ch-auto-grid gap-4">
            <div>
              <Label htmlFor="rt-bathroom">Bathroom Arrangement</Label>
              <select
                id="rt-bathroom"
                value={bathroomType}
                onChange={(e) => setBathroomType(e.target.value as BathroomType)}
                className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
              >
                {Object.entries(BATHROOM_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="rt-capacity">Bedspace Capacity</Label>
              <Input
                id="rt-capacity"
                type="number"
                min={1}
                max={20}
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                required
                className="mt-1.5"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Total physical beds in this room.
              </p>
            </div>

            <div>
              <Label htmlFor="rt-size">Room Size (sqm, optional)</Label>
              <Input
                id="rt-size"
                type="number"
                step="0.1"
                min={5}
                max={150}
                value={sizeSqm}
                onChange={(e) => setSizeSqm(e.target.value)}
                placeholder="e.g. 18"
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="ch-auto-grid gap-4">
            <div>
              <Label htmlFor="rt-price">Semester Price per Bed (UGX)</Label>
              <Input
                id="rt-price"
                type="text"
                value={pricePerTermUgx}
                onChange={(e) => setPricePerTermUgx(e.target.value)}
                placeholder="e.g. 1,200,000"
                required
                className="mt-1.5 font-mono"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Price for one individual bed for the semester term.
              </p>
            </div>

            <div>
              <Label htmlFor="rt-deposit">Security Deposit (UGX, optional)</Label>
              <Input
                id="rt-deposit"
                type="text"
                value={depositUgx}
                onChange={(e) => setDepositUgx(e.target.value)}
                placeholder="e.g. 200,000"
                className="mt-1.5 font-mono"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Refundable deposit if required.
              </p>
            </div>
          </div>

          <div>
            {needsDescription && <p id="rt-desc-hint" className="mb-2 text-sm text-primary">Another room type uses this name. Describe what makes this one different, such as size, price or features.</p>}
            <Label htmlFor="rt-desc">Description{needsDescription ? " (required for this name)" : ""}</Label>
            <Textarea
              id="rt-desc"
              required={needsDescription}
              aria-describedby={needsDescription ? "rt-desc-hint" : undefined}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Highlight room layout, natural lighting, views, ventilation, or study environment..."
              className="mt-1.5 min-h-20"
            />
          </div>

          <div>
            <Label className="block mb-2">Room Amenities and Features</Label>
            <div className="flex flex-wrap gap-2">
              {amenityOptions.map((item) => {
                const checked = amenities.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleAmenity(item)}
                    aria-pressed={checked}
                    className={`inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      checked
                        ? "bg-teal-600 text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {checked && <Check className="size-3.5" />}
                    {item}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
              <div>
                <Label>Room Photographs ({photos.length}/10)</Label>
                <p className="text-xs text-muted-foreground">
                  Upload up to 10 clear photos showing bed, desk, bathroom, and space.
                </p>
              </div>
              <Button type="button" variant="secondary" size="sm" className="min-h-11 shrink-0"
                disabled={photos.length >= 10 || uploading || submitting} onClick={() => photoInput.current?.click()}>
                <ImagePlus aria-hidden className="mr-1.5 size-4" />
                {uploading ? "Uploading photos…" : "Add Photos"}
              </Button>
              <input ref={photoInput} type="file" multiple accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                aria-label="Choose room photos" onChange={handlePhotoUpload} disabled={photos.length >= 10 || uploading || submitting} hidden />
            </div>

            {photoError && <p role="alert" className="mb-3 rounded-md border border-destructive/30 p-3 text-sm text-destructive">{photoError}</p>}
            {uploading && <p role="status" className="mb-3 text-sm text-muted-foreground">Uploading photos. Keep this window open until the preview appears.</p>}
            {photos.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center bg-muted/20">
                <Camera className="size-8 text-muted-foreground/60 mb-2" />
                <p className="text-sm font-semibold text-foreground">No photos uploaded yet</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Photos must be approved by Operations before appearing in the public gallery.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
                {photos.map((photo) => {
                  const url = listingPhotoUrl(photo.storageKey, 300);
                  return (
                    <div
                      key={photo.id}
                      className="group relative aspect-4/3 overflow-hidden rounded-lg border border-border bg-card shadow-xs"
                    >
                      {url ? (
                        <NextImage
                          src={url}
                          alt="Room preview"
                          fill
                          sizes="(min-width: 768px) 20vw, 50vw"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center bg-muted text-xs text-muted-foreground">
                          Photo
                        </div>
                      )}

                      <div className="absolute inset-0 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPrimaryPhoto(photo.id)}
                          title="Set as Cover Photo"
                          className={`rounded-full p-1.5 transition-colors ${
                            photo.isPrimary
                              ? "bg-amber-500 text-white"
                              : "bg-white/80 text-foreground hover:bg-white"
                          }`}
                        >
                          <Star className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removePhoto(photo.id)}
                          title="Delete Photo"
                          className="rounded-full bg-red-600 p-1.5 text-white hover:bg-red-700 transition-colors"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>

                      {photo.isPrimary && (
                        <span className="absolute bottom-1.5 left-1.5 rounded-md bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-xs">
                          Cover
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter className="flex-wrap [&>*]:h-auto [&>*]:min-h-11 [&>*]:max-w-full [&>*]:whitespace-normal [&>*]:py-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={submitting || uploading}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || uploading}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {roomType ? "Save Specifications" : "Add Room Type"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
