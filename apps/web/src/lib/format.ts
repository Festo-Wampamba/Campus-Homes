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
// Matches the Google Form's "Amenities" list field-for-field (0025).
export const AMENITY_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "electricity", label: "Electricity" },
  { key: "water_supply", label: "Water" },
  { key: "hot_water", label: "Hot water" },
  { key: "backup_water", label: "Backup water" },
  { key: "power_backup", label: "Backup electricity" },
  { key: "internet", label: "Internet" },
  { key: "wifi", label: "Wi-Fi" },
  { key: "laundry", label: "Laundry" },
  { key: "common_room", label: "Common room / TV area" },
  { key: "dining_area", label: "Dining area" },
  { key: "parking", label: "Parking" },
  { key: "shop", label: "Shop" },
  { key: "security_guard", label: "Security" },
  { key: "cleaning", label: "Cleaning" },
  { key: "meals", label: "Meals" },
  { key: "reception", label: "Reception" },
];

// "Utilities Included" — a distinct question from Amenities on the Google
// Form (mostly furnishing-level, not services). Same free-form-key pattern.
export const UTILITY_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "bathroom", label: "Bathroom" },
  { key: "kitchen", label: "Kitchen" },
  { key: "fully_furnished", label: "Fully furnished" },
  { key: "partly_furnished", label: "Partly furnished" },
  { key: "unfurnished", label: "Unfurnished" },
  { key: "mattress", label: "Mattress" },
  { key: "wardrobe", label: "Wardrobe" },
  { key: "study_desk", label: "Study desk" },
  { key: "bed", label: "Bed" },
];

export const SECURITY_FEATURE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "perimeter_wall", label: "Perimeter wall" },
  { key: "security_guard", label: "Security guard" },
  { key: "cctv", label: "CCTV" },
  { key: "fire_extinguishers", label: "Fire extinguishers" },
  { key: "smoke_detectors", label: "Smoke detectors" },
  { key: "emergency_exit", label: "Emergency exit" },
  { key: "first_aid_kit", label: "First aid kit" },
  { key: "off_grid_light", label: "Off-grid light" },
];

export const ACCESSIBILITY_FEATURE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "step_free_entrance", label: "Step-free entrance" },
  { key: "ground_floor_rooms", label: "Ground floor rooms" },
  { key: "accessible_bathroom", label: "Accessible bathroom" },
  { key: "lift", label: "Lift" },
  { key: "wheelchair_accessible", label: "Wheelchair accessible" },
];

export const LANDLORD_BUSINESS_TYPE_LABELS: Record<string, string> = {
  individual_landlord: "Individual landlord",
  joint_owners: "Joint owners",
  family_business: "Family business",
  registered_company: "Registered company",
  partnership: "Partnership",
  hostel_management_company: "Hostel management company",
  property_agent: "Property agent",
  university: "University",
  religious_organisation: "Religious organisation",
  other: "Other",
};

export const PROPERTY_AUTHORITY_ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  joint_owner: "Joint owner",
  property_manager: "Property manager",
  caretaker: "Caretaker",
  agent: "Agent",
  family_representative: "Family representative",
  tenant_allowed_to_sublet: "Tenant allowed to sublet",
  other: "Other",
};

export const GENDER_ARRANGEMENT_LABELS: Record<string, string> = {
  male_only: "Male only",
  female_only: "Female only",
  mixed: "Mixed",
};

export const RENT_PERIOD_LABELS: Record<string, string> = {
  monthly: "Monthly",
  per_semester: "Per semester",
  other: "Other",
};

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
