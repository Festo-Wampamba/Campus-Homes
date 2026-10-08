import {
  BatteryCharging, Car, CircleCheck, ConciergeBell, Droplet, Droplets, Globe, ShieldCheck,
  ShowerHead, Soup, SprayCan, Store, Tv, UtensilsCrossed, WashingMachine, Wifi, Zap,
  type LucideIcon,
} from "lucide-react";

import { AMENITY_OPTIONS, humanizeKey } from "@/lib/format";

const AMENITY_ICONS: Record<string, LucideIcon> = {
  electricity: Zap, water_supply: Droplet, hot_water: ShowerHead, backup_water: Droplets,
  power_backup: BatteryCharging, internet: Globe, wifi: Wifi, laundry: WashingMachine,
  common_room: Tv, dining_area: UtensilsCrossed, parking: Car, shop: Store,
  security_guard: ShieldCheck, cleaning: SprayCan, meals: Soup, reception: ConciergeBell,
};

const LABELS = new Map(AMENITY_OPTIONS.map((o) => [o.key, o.label]));

/** Confirmed amenities, each with an icon that says what it is. Custom
 * (free-form) amenities fall back to a check mark. */
export function AmenityList({ keys }: { keys: string[] }) {
  return (
    <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
      {keys.map((key) => {
        const Icon = AMENITY_ICONS[key] ?? CircleCheck;
        return (
          <li key={key} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-medium">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
              <Icon aria-hidden className="size-4" />
            </span>
            {LABELS.get(key) ?? humanizeKey(key)}
          </li>
        );
      })}
    </ul>
  );
}
