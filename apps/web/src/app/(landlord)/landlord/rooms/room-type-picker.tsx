"use client";

import type { RoomType } from "@/lib/room-management";

/** What a landlord sees for a room type: its name and bed count. */
export function roomTypeOptionLabel(roomType: RoomType): string {
  const version = roomType.pendingVersion ?? roomType.currentVersion;
  const beds = version?.capacity ?? 1;
  return `${version?.title ?? "Untitled"} (${beds} ${beds === 1 ? "bed" : "beds"})`;
}

/** The chosen room type if it's still in the list, else the first one. A
 * dialog remembers its choice from when it first opened; when room types
 * load later or the property changes, that id isn't an option any more and
 * the select showed blank. Always resolving to a real option prevents it. */
export function resolveRoomTypeId(roomTypes: RoomType[], chosenId: string): string {
  return roomTypes.some((roomType) => roomType.id === chosenId) ? chosenId : (roomTypes[0]?.id ?? "");
}

/** Room type picker shared by Add room and Bulk generate. Options carry the
 * select's own colours so the open list stays readable in dark mode on
 * Windows, where the browser otherwise draws it with system colours. */
export function RoomTypePicker({
  id,
  roomTypes,
  value,
  onChange,
}: {
  id: string;
  roomTypes: RoomType[];
  value: string;
  onChange: (roomTypeId: string) => void;
}) {
  return (
    <select
      id={id}
      value={resolveRoomTypeId(roomTypes, value)}
      onChange={(event) => onChange(event.target.value)}
      required
      disabled={roomTypes.length === 0}
      className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-card [&>option]:text-foreground"
    >
      {roomTypes.length === 0 && <option value="">No room types yet</option>}
      {roomTypes.map((roomType) => (
        <option key={roomType.id} value={roomType.id}>
          {roomTypeOptionLabel(roomType)}
        </option>
      ))}
    </select>
  );
}
