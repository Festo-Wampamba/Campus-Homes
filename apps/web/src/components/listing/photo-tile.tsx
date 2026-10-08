"use client";

import { useState } from "react";

import { listingPhotoUrl } from "@/lib/cloudinary";
import { cn } from "@/lib/utils";
import { PhotoLightbox, type LightboxPhoto, type LightboxState } from "@/components/listing/photo-lightbox";

/** A photo shown whole (contain over a blurred copy of itself, never
 * cropped). With `interactive`, tapping it opens the full-screen viewer on
 * `photos[index]`, with arrows through the rest of the set. */
export function PhotoTile({
  photos,
  index = 0,
  width = 600,
  alt,
  caption = alt,
  className,
  interactive = true,
}: {
  photos: LightboxPhoto[];
  index?: number;
  width?: number;
  alt: string;
  caption?: string;
  className?: string;
  interactive?: boolean;
}) {
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const photo = photos[index];
  const url = photo ? listingPhotoUrl(photo.storageKey, width) : null;
  if (!url) return null;

  const image = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary-origin storage URL */}
      <img src={url} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover opacity-60 blur-xl" />
      {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary-origin storage URL */}
      <img src={url} alt={alt} className="relative size-full object-contain" />
    </>
  );

  if (!interactive) {
    return <div className={cn("relative overflow-hidden bg-muted", className)}>{image}</div>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setLightbox({ photos, index, caption })}
        aria-label={`View ${alt} full size`}
        className={cn("relative block overflow-hidden bg-muted outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring", className)}
      >
        {image}
      </button>
      <PhotoLightbox
        state={lightbox}
        propertyName={alt}
        onClose={() => setLightbox(null)}
        onNavigate={(delta) =>
          setLightbox((s) => (s ? { ...s, index: (s.index + delta + s.photos.length) % s.photos.length } : s))
        }
      />
    </>
  );
}
