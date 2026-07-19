const ugx = new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 });

export function formatUgx(amount: number): string {
  return `UGX ${ugx.format(amount)}`;
}

// A listing prices each room type independently — this is the one label map
// shared by every surface that shows a category (onboarding, ops publish,
// search, detail).
export const ROOM_CATEGORY_LABELS: Record<string, string> = {
  single: "Single",
  double: "Double",
  triple: "Triple",
  quad: "Quad",
  other: "Other",
};

export function roomCategoryLabel(category: string): string {
  return ROOM_CATEGORY_LABELS[category] ?? category;
}

// Default sleeping capacity implied by a category — lets Ops skip a redundant
// "how many people" field for the standard types.
export const ROOM_CATEGORY_DEFAULT_CAPACITY: Record<string, number> = {
  single: 1,
  double: 2,
  triple: 3,
  quad: 4,
  other: 1,
};

// A listing rarely has one price — this is the "from X" / "X–Y" line every
// card and pin uses instead of implying a single flat rate.
export function formatPriceRange(minUgx: number, maxUgx: number): string {
  if (minUgx === maxUgx) return formatUgx(minUgx);
  return `${formatUgx(minUgx)} – ${ugx.format(maxUgx)}`;
}

// amenity keys are snake_case in the jsonb ("water_supply" → "Water supply")
export function humanizeKey(key: string): string {
  const words = key.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Shared amenity vocabulary — a landlord's proposedAmenities (informational,
// pre-fills the Ops publish form) and Ops' authoritative listing_versions
// .amenities must use the same keys, or a landlord's "wifi" checkbox and
// Ops' "wifi" checkbox would silently drift apart. Both forms import this.
export const AMENITY_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "water_supply", label: "Water supply" },
  { key: "power_backup", label: "Power backup" },
  { key: "wifi", label: "Wi-Fi" },
  { key: "security_guard", label: "Security guard" },
  { key: "parking", label: "Parking" },
  { key: "furnished", label: "Furnished" },
];

// A hostel is never one room at one price — units.capacity varies per room,
// so search results show the spread instead of implying a single room type.
export function roomSizeLabel(row: {
  unit_count: number;
  min_capacity: number | null;
  max_capacity: number | null;
}): string | null {
  if (row.unit_count === 0 || row.min_capacity == null || row.max_capacity == null) {
    return null;
  }
  const sleeps =
    row.min_capacity === row.max_capacity
      ? `Sleeps ${row.min_capacity}`
      : `Sleeps ${row.min_capacity}–${row.max_capacity}`;
  return `${sleeps} · ${row.unit_count} room${row.unit_count === 1 ? "" : "s"}`;
}
