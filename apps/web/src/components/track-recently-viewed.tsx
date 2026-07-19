"use client";

import { useEffect } from "react";

import { addRecentlyViewed } from "@/lib/recently-viewed";

/** Renders nothing — just records this listing into the browser's
 * recently-viewed list on mount. Client-side only, no backend involved. */
export function TrackRecentlyViewed({
  id,
  name,
  streetAddress,
  photoStorageKey,
  priceUgx,
}: {
  id: string;
  name: string;
  streetAddress: string;
  photoStorageKey: string | null;
  priceUgx: number;
}) {
  useEffect(() => {
    addRecentlyViewed({ id, name, streetAddress, photoStorageKey, priceUgx });
  }, [id, name, streetAddress, photoStorageKey, priceUgx]);

  return null;
}
