"use client";

import { useState } from "react";
import Image from "next/image";
import { Camera, Expand } from "lucide-react";

import { listingPhotoUrl } from "@/lib/cloudinary";
import { cn } from "@/lib/utils";
import { PhotoLightbox, type LightboxState } from "@/components/listing/photo-lightbox";

type GalleryPhoto = { id: string; storageKey: string };

const VISIBLE = 3;

/**
 * Listing gallery: one large photo plus two beside it. Photos are shown whole
 * (object-contain over a blurred copy of themselves), never cropped, and any
 * tile opens the full-screen viewer at that photo.
 */
export function ListingGallery({ photos, propertyName }: { photos: GalleryPhoto[]; propertyName: string }) {
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  if (photos.length === 0) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-teal-50 text-muted-foreground sm:aspect-[16/9]">
        <span className="inline-flex items-center gap-2 text-sm">
          <Camera aria-hidden className="size-4" />
          Photos coming soon
        </span>
      </div>
    );
  }

  const open = (index: number) => setLightbox({ photos, index, caption: `${propertyName} photos` });
  const visible = photos.slice(0, VISIBLE);
  const hidden = photos.length - visible.length;
  const hasSide = visible.length > 1;

  return (
    <>
      <div className={cn("grid gap-2", hasSide && "sm:grid-cols-3 sm:grid-rows-2")}>
        {visible.map((photo, i) => {
          const main = i === 0;
          const url = listingPhotoUrl(photo.storageKey, main ? 1200 : 600);
          const showMore = !main && i === visible.length - 1 && hidden > 0;
          return (
            <button
              key={photo.id}
              type="button"
              onClick={() => open(i)}
              aria-label={`Open photo ${i + 1} of ${photos.length}`}
              className={cn(
                "relative overflow-hidden rounded-2xl bg-muted outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring",
                main
                  ? cn("aspect-[4/3]", hasSide && "sm:col-span-2 sm:row-span-2 sm:aspect-auto sm:h-[30rem]")
                  : cn("hidden sm:block", visible.length === 2 && "sm:row-span-2"),
              )}
            >
              {url ? (
                <>
                  <Image src={url} alt="" aria-hidden fill sizes="10vw" className="scale-110 object-cover opacity-60 blur-2xl" />
                  <Image
                    src={url}
                    alt={`${propertyName}, photo ${i + 1}`}
                    fill
                    sizes={main ? "(min-width: 640px) 60vw, 100vw" : "25vw"}
                    className="object-contain"
                    priority={main}
                  />
                </>
              ) : (
                <span className="flex h-full items-center justify-center text-muted-foreground">
                  <Camera aria-hidden className="size-5" />
                </span>
              )}
              {showMore && (
                <span className="absolute inset-0 grid place-items-center bg-black/55 text-sm font-semibold text-white">
                  +{hidden} more
                </span>
              )}
              {main && (
                <span className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white">
                  <Expand aria-hidden className="size-3.5" />
                  {photos.length > 1 ? `View all ${photos.length} photos` : "View photo"}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <PhotoLightbox
        state={lightbox}
        propertyName={propertyName}
        onClose={() => setLightbox(null)}
        onNavigate={(delta) =>
          setLightbox((s) => (s ? { ...s, index: (s.index + delta + s.photos.length) % s.photos.length } : s))
        }
      />
    </>
  );
}
