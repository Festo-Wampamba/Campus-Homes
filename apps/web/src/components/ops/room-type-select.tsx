import { SELECTABLE_ROOM_CATEGORIES, type RoomCategory } from "@campushomes/shared";

import { roomCategoryLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Which room type a verification photo belongs to, whatever it shows: an
 * en-suite bathroom photo can belong to the single self-contained rooms.
 * Empty = a photo of the whole property. */
export function RoomTypeSelect({
  value,
  onChange,
  className,
}: {
  value: RoomCategory | undefined;
  onChange: (value: RoomCategory | undefined) => void;
  className?: string;
}) {
  return (
    <select
      aria-label="Room type this photo belongs to"
      value={value ?? ""}
      onChange={(e) => onChange((e.target.value || undefined) as RoomCategory | undefined)}
      className={cn("w-full rounded border border-input bg-background text-xs", className)}
    >
      <option value="">Whole property</option>
      {/* Self-contained has its own checkbox beside each photo. A retired
          type (bedsitter) stays selectable only on a photo that already has it. */}
      {[...SELECTABLE_ROOM_CATEGORIES.filter((c) => c !== "self_contained"), ...(value && !(SELECTABLE_ROOM_CATEGORIES as readonly RoomCategory[]).includes(value) ? [value] : [])].map((c) => (
        <option key={c} value={c}>{roomCategoryLabel(c)} room</option>
      ))}
    </select>
  );
}
