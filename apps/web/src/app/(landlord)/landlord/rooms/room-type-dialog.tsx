"use client";

import NextImage from "next/image";
import { useState } from "react";
import { Camera, Check, ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
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
import { ROOM_CATEGORIES, type RoomCategory } from "@campushomes/shared";

interface RoomTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  semesterId: string;
  roomType?: RoomType | null;
  onSaved: (savedType: RoomType) => void;
}

const COMMON_AMENITIES = [
  "Wi-Fi",
  "Hot Water",
  "Reading Desk & Chair",
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
  const [amenities, setAmenities] = useState<string[]>(current?.amenities ?? []);
  const [photos, setPhotos] = useState<RoomTypePhoto[]>(current?.photos ?? []);

  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleAmenity(item: string) {
    setAmenities((prev) =>
      prev.includes(item) ? prev.filter((a) => a !== item) : [...prev, item],
    );
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    if (photos.length + files.length > 10) {
      setError("You can upload a maximum of 10 photos per room type.");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      for (const file of files) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
          throw new Error("Only JPEG, PNG, and WebP images are allowed.");
        }
        if (file.size > 8 * 1024 * 1024) {
          throw new Error("Each image must be 8 MB or less.");
        }

        const sig = await api<CloudinarySignature>("/uploads/sign", {
          method: "POST",
          body: JSON.stringify({ folder: `properties/${propertyId}/room-types`, contentType: file.type }),
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
      setError(apiErrorMessage(err, "Photo upload failed. Please try again."));
    } finally {
      setUploading(false);
      e.target.value = "";
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
    setError(null);

    const price = Number(pricePerTermUgx.replace(/[^0-9]/g, ""));
    if (!price || price <= 0) {
      setError("Please enter a valid price per bed per semester.");
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
    <Dialog open={open} onOpenChange={onOpenChange} size="xl">
      <form onSubmit={handleSubmit} className="flex flex-col h-full">
        <DialogHeader
          title={roomType ? "Edit Room Type Specification" : "Create Room Type"}
          description="Define the room category, bathroom type, sleeping capacity, amenities, and price per bedspace per semester."
          onClose={() => onOpenChange(false)}
        />

        <DialogBody className="space-y-6">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/20 bg-destructive-subtle p-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
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
                Public display name shown to students.
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
                {ROOM_CATEGORIES.filter((cat) => cat !== "self_contained" || cat === category).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.replace("_", " ").toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
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

          <div className="grid gap-4 sm:grid-cols-2">
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
            <Label htmlFor="rt-desc">Description</Label>
            <Textarea
              id="rt-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Highlight room layout, natural lighting, views, ventilation, or study environment..."
              className="mt-1.5 min-h-20"
            />
          </div>

          <div>
            <Label className="block mb-2">Room Amenities and Features</Label>
            <div className="flex flex-wrap gap-2">
              {COMMON_AMENITIES.map((item) => {
                const checked = amenities.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleAmenity(item)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
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
            <div className="flex items-center justify-between mb-2">
              <div>
                <Label>Room Photographs ({photos.length}/10)</Label>
                <p className="text-xs text-muted-foreground">
                  Upload up to 10 clear photos showing bed, desk, bathroom, and space.
                </p>
              </div>
              <label
                className={`inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted cursor-pointer ${
                  photos.length >= 10 || uploading ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                {uploading ? (
                  <Loader2 className="size-4 animate-spin text-teal-600" />
                ) : (
                  <ImagePlus className="size-4 text-teal-600" />
                )}
                <span>Add Photos</span>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoUpload}
                  disabled={photos.length >= 10 || uploading}
                  className="sr-only"
                />
              </label>
            </div>

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

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
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
