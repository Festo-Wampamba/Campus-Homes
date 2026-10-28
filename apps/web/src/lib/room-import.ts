import { roomTypeImportLabels } from "@campushomes/shared";

import { roomCategoryLabel } from "@/lib/format";
import type { RoomType, RoomUnit } from "@/lib/room-management";

/** A spreadsheet row as the API parsed it (POST /room-management/rooms/import/parse). */
export type ImportedRoomRow = {
  rowNumber: number;
  roomCode: string;
  roomType: string;
  buildingName: string;
  floorLabel: string;
};

export type PlannedRoomRow = ImportedRoomRow & { roomTypeId: string | null; error: string | null };

export type RoomImportBatch = {
  roomTypeId: string;
  buildingName: string | null;
  floorLabel: string | null;
  roomCodes: string[];
};

// The bulk endpoint takes at most 200 codes for one room type, building and floor.
const BATCH_LIMIT = 200;

const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const roomKey = (code: string, building: string | null | undefined) => `${norm(code)}|${norm(building ?? "")}`;

/** Finds the property room type a spreadsheet names: its template name
 * (roomTypeImportLabels, unique per type) first, then its exact title
 * (approved or a pending rename), otherwise a category ("Single") only one
 * type has. A name that fits several types is an error, never a guess. */
function matchRoomType(text: string, roomTypes: RoomType[]): { id: string } | { error: string } {
  if (!text.trim()) {
    return roomTypes.length === 1 ? { id: roomTypes[0]!.id } : { error: "Add the room type" };
  }
  const wanted = norm(text);
  const labels = roomTypeImportLabels(roomTypes);
  const byLabel = [...labels].find(([, label]) => norm(label) === wanted);
  if (byLabel) return { id: byLabel[0] };
  const versions = (type: RoomType) => [type.pendingVersion, type.currentVersion].filter((v) => !!v);
  const byTitle = roomTypes.filter((type) => versions(type).some((v) => norm(v.title) === wanted));
  if (byTitle.length === 1) return { id: byTitle[0]!.id };
  if (byTitle.length > 1) {
    const choices = byTitle.map((type) => `"${labels.get(type.id)}"`).join(" or ");
    return { error: `Several room types are called "${text}"; pick ${choices} from the template list` };
  }
  const byCategory = roomTypes.filter((type) =>
    versions(type).some(
      (v) => norm(roomCategoryLabel(v.category)) === wanted || norm(v.category.replace(/_/g, " ")) === wanted,
    ),
  );
  if (byCategory.length === 1) return { id: byCategory[0]!.id };
  if (byCategory.length > 1) return { error: `"${text}" fits several room types; use the exact name` };
  return { error: `No room type called "${text}"` };
}

/** Problems with the row itself. Lengths match the API's limits, so a value is
 * rejected here rather than cut short and stored somewhere else. */
function rowError(row: ImportedRoomRow, isRepeat: boolean, exists: boolean): string | null {
  if (!row.roomCode) return "Room code is empty";
  if (row.roomCode.length > 100) return "Room code is too long (100 characters at most)";
  if (row.buildingName.length > 120) return "Building is too long (120 characters at most)";
  if (row.floorLabel.length > 80) return "Floor is too long (80 characters at most)";
  if (isRepeat) return "Listed twice in this file";
  if (exists) return "Already exists in this building";
  return null;
}

/** Checks every row against this property's room types and rooms, the same
 * conflict rule the API applies (room code unique within a building). */
export function planRoomImport(rows: ImportedRoomRow[], roomTypes: RoomType[], existingRooms: RoomUnit[]) {
  const taken = new Set(existingRooms.map((room) => roomKey(room.roomCode, room.buildingName)));
  const seen = new Set<string>();
  const planned: PlannedRoomRow[] = rows.map((row) => {
    const key = roomKey(row.roomCode, row.buildingName);
    const type = matchRoomType(row.roomType, roomTypes);
    const error = rowError(row, seen.has(key), taken.has(key)) ?? ("error" in type ? type.error : null);
    if (row.roomCode) seen.add(key);
    return { ...row, roomTypeId: "id" in type ? type.id : null, error };
  });

  const groups = new Map<string, RoomImportBatch>();
  for (const row of planned) {
    if (row.error || !row.roomTypeId) continue;
    const buildingName = row.buildingName || null;
    const floorLabel = row.floorLabel || null;
    // JSON, not a joined string: building or floor may contain any character.
    const groupKey = JSON.stringify([row.roomTypeId, buildingName, floorLabel]);
    const group = groups.get(groupKey) ?? { roomTypeId: row.roomTypeId, buildingName, floorLabel, roomCodes: [] };
    group.roomCodes.push(row.roomCode);
    groups.set(groupKey, group);
  }
  const batches = [...groups.values()].flatMap((group) =>
    Array.from({ length: Math.ceil(group.roomCodes.length / BATCH_LIMIT) }, (_, i) => ({
      ...group,
      roomCodes: group.roomCodes.slice(i * BATCH_LIMIT, (i + 1) * BATCH_LIMIT),
    })),
  );
  return { rows: planned, batches, validCount: planned.filter((row) => !row.error).length };
}
