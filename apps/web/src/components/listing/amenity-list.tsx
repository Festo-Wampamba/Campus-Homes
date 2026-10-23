"use client";

import { useId, useState } from "react";
import {
  Accessibility,
  Armchair,
  Bath,
  BatteryCharging,
  BedDouble,
  Car,
  Cctv,
  ChefHat,
  CircleCheck,
  ConciergeBell,
  DoorOpen,
  Droplet,
  Droplets,
  Fence,
  FireExtinguisher,
  Globe,
  Home,
  LampDesk,
  ShieldCheck,
  ShowerHead,
  Siren,
  Sofa,
  Soup,
  SprayCan,
  Store,
  Tv,
  UtensilsCrossed,
  WashingMachine,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { amenityLabel } from "@/lib/amenity-label";
export { amenityLabel } from "@/lib/amenity-label";
import { FeatureIcon } from "@/components/listing/feature-icon";

/** The existing listing vocabulary, plus the utility/security fields that
 * may be stored alongside it by older published listing snapshots. */
const AMENITY_ICONS: Record<string, LucideIcon> = {
  electricity: Zap,
  water_supply: Droplet,
  hot_water: ShowerHead,
  backup_water: Droplets,
  power_backup: BatteryCharging,
  internet: Globe,
  wifi: Wifi,
  laundry: WashingMachine,
  common_room: Tv,
  dining_area: UtensilsCrossed,
  parking: Car,
  shop: Store,
  security_guard: ShieldCheck,
  cleaning: SprayCan,
  meals: Soup,
  reception: ConciergeBell,
  bathroom: Bath,
  kitchen: ChefHat,
  fully_furnished: Sofa,
  partly_furnished: Armchair,
  unfurnished: Home,
  mattress: BedDouble,
  wardrobe: DoorOpen,
  study_desk: LampDesk,
  bed: BedDouble,
  perimeter_wall: Fence,
  cctv: Cctv,
  fire_extinguishers: FireExtinguisher,
  smoke_detectors: Siren,
  emergency_exit: DoorOpen,
  first_aid_kit: Accessibility,
  off_grid_light: Zap,
  ground_floor_rooms: Home,
  accessible_bathroom: Accessibility,
  wheelchair_accessible: Accessibility,
};

/** Return the Lucide icon for one stored amenity key. Custom keys use the
 * same neutral check icon as before instead of pretending to know more. */
export function amenityIcon(key: string): LucideIcon {
  return AMENITY_ICONS[key] ?? CircleCheck;
}

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
              <FeatureIcon icon={Icon} label={amenityLabel(key)} className="font-medium text-foreground" />
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
