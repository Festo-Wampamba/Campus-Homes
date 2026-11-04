"use client";

import { useId, useState } from "react";
import { amenityIcon } from "@/lib/amenity-icon";
export { amenityIcon } from "@/lib/amenity-icon";
import { amenityLabel } from "@/lib/amenity-label";
export { amenityLabel } from "@/lib/amenity-label";
import { FeatureIcon } from "@/components/listing/feature-icon";

const COLLAPSE_LIMIT = 6;

export function AmenityList({ keys }: { keys: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const generatedId = useId();
  const listId = `amenities-${generatedId.replace(/:/g, "")}`;
  const visibleKeys = expanded ? keys : keys.slice(0, COLLAPSE_LIMIT);
  const hasMore = keys.length > COLLAPSE_LIMIT;

  if (keys.length === 0) return null;

  return (
    <>
      <ul id={listId} className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        {visibleKeys.map((key, index) => {
          const Icon = amenityIcon(key);
          return (
            <li key={`${key}-${index}`} className="min-w-0 rounded-xl border border-border bg-card px-3 py-2.5">
              <FeatureIcon iconClassName="size-6" icon={Icon} label={amenityLabel(key)} className="font-medium text-foreground" />
            </li>
          );
        })}
      </ul>
      {hasMore && (
        <button
          type="button"
          className="mt-3 min-h-11 rounded-md px-1 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show fewer" : `Show all ${keys.length} amenities`}
        </button>
      )}
    </>
  );
}
