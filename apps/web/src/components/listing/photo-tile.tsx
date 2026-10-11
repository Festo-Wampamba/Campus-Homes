"use client";

import { useState } from "react";

import { listingPhotoUrl } from "@/lib/cloudinary";
import { cn } from "@/lib/utils";
import { PhotoLightbox, type LightboxPhoto, type LightboxState } from "@/components/listing/photo-lightbox";

/** One photo. `fit="cover"` (default) fills a fixed-size tile, trimming the
 * edges of a photo whose shape differs from the tile; `fit="natural"` sizes
 * the frame to the photo itself, for a photo shown on its own. Either way the
 * full, uncropped photo opens in the viewer when `interactive`, with arrows
 * through the rest of `photos`. */
export function PhotoTile({
  photos,
  index = 0,
  width = 600,
  alt,
  caption = alt,
  className,
  interactive = true,
  fit = "cover",
}: {
  photos: LightboxPhoto[];
  index?: number;
  width?: number;
  alt: string;
  caption?: string;
  className?: string;
  interactive?: boolean;
  fit?: "cover" | "natural";
}) {
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const photo = photos[index];
  const url = photo ? listingPhotoUrl(photo.storageKey, width) : null;
  if (!url) return null;

  const natural = fit === "natural";
  const image = (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary-origin storage URL
    <img
      src={url}
      alt={alt}
      className={natural ? "mx-auto block h-auto max-h-[24rem] w-auto max-w-full rounded-md" : "size-full object-cover"}
    />
  );
  const frame = natural ? "block w-full" : "relative block overflow-hidden bg-muted";

  if (!interactive) {
    return <div className={cn(frame, className)}>{image}</div>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setLightbox({ photos, index, caption })}
        aria-label={`View ${alt} full size`}
        className={cn(frame, "outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring", className)}
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
