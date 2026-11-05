"use client";

import { useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import {
  canBeSelfContained,
  orderPhotosCoverFirst,
  PHOTO_CATEGORIES,
  PHOTO_CATEGORY_LABELS,
  type PhotoCategory,
  type VisitPhoto,
} from "@campushomes/shared";

import { api } from "@/lib/api";
import { RoomTypeSelect } from "@/components/ops/room-type-select";
import { listingPhotoUrl, uploadToCloudinary, type CloudinarySignature } from "@/lib/cloudinary";

/** The Ops lead's view of a listing's photo set: retype, relabel or remove
 * what the inspector captured, and upload anything they missed. The cover is
 * picked by orderPhotosCoverFirst, the same rule the publish API applies. */
export function PhotoSetEditor({
  photos,
  onChange,
  landlordCoverKey = null,
}: {
  photos: VisitPhoto[];
  onChange: (photos: VisitPhoto[]) => void;
  landlordCoverKey?: string | null;
}) {
  const coverKey = orderPhotosCoverFirst(photos, landlordCoverKey)[0]?.storageKey;
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (index: number, patch: Partial<VisitPhoto>) =>
    onChange(photos.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const added: VisitPhoto[] = [];
      for (const file of files) {
        const sig = await api<CloudinarySignature>("/uploads/sign", {
          method: "POST",
          body: JSON.stringify({ contentType: file.type, size: file.size }),
        });
        const { publicId } = await uploadToCloudinary(file, sig);
        added.push({ storageKey: publicId, category: "bedroom" });
      }
      onChange([...photos, ...added]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload. Try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Photos</legend>
      <p className="text-xs text-muted-foreground">
        Set what each photo shows, remove any that are wrong, and add photos the inspector missed.
        The cover is the landlord&apos;s own cover photo; without one, the first Exterior photo,
        otherwise the first photo.
      </p>
      {photos.length === 0 && (
        <p className="text-sm text-muted-foreground">No photos yet. The listing will go live without any.</p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo, i) => {
          const src = listingPhotoUrl(photo.storageKey, 400);
          const badge = [
            photo.storageKey === coverKey && "Cover",
            photo.storageKey === landlordCoverKey && "Landlord's cover",
          ].filter(Boolean).join(" · ");
          return (
            <div key={photo.storageKey} className="space-y-1.5 rounded-md border border-border p-2">
              <div className="relative">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element -- storage URLs vary per bucket
                  <img src={src} alt={PHOTO_CATEGORY_LABELS[photo.category]} className="aspect-square w-full rounded object-cover" />
                ) : (
                  <div className="grid aspect-square w-full place-items-center rounded bg-muted text-xs text-muted-foreground">
                    No preview
                  </div>
                )}
                {badge && (
                  <span className="absolute left-1 top-1 rounded bg-background/90 px-1.5 py-0.5 text-[11px] font-semibold">
                    {badge}
                  </span>
                )}
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => onChange(photos.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 grid size-7 place-items-center rounded bg-background/90 hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </div>
              <select
                aria-label="Photo type"
                value={photo.category}
                onChange={(e) => {
                  const category = e.target.value as PhotoCategory;
                  update(i, {
                    category,
                    ...(category === "custom" ? {} : { label: undefined }),
                    ...(canBeSelfContained({ category, roomCategory: photo.roomCategory }) ? {} : { selfContained: undefined }),
                  });
                }}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {PHOTO_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{PHOTO_CATEGORY_LABELS[c]}</option>
                ))}
              </select>
              {photo.category === "custom" && (
                <input
                  aria-label="Custom photo label"
                  value={photo.label ?? ""}
                  maxLength={50}
                  placeholder="What does it show?"
                  onChange={(e) => update(i, { label: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                />
              )}
              <RoomTypeSelect
                value={photo.roomCategory}
                onChange={(roomCategory) =>
                  update(i, {
                    roomCategory,
                    ...(canBeSelfContained({ ...photo, roomCategory }) ? {} : { selfContained: undefined }),
                  })
                }
                className="h-9 px-2 text-sm"
              />
              {canBeSelfContained(photo) && (
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={photo.selfContained ?? false}
                    onChange={(e) => update(i, { selfContained: e.target.checked })}
                  />
                  Self-contained
                </label>
              )}
            </div>
          );
        })}
      </div>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-muted">
        <ImagePlus aria-hidden className="size-4" />
        {uploading ? "Uploading…" : "Add photos"}
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={uploading}
          onChange={(e) => {
            void addFiles([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </label>
      {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
    </fieldset>
  );
}
