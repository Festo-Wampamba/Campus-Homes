import { roomTypeImportLabels } from "@campushomes/shared";

import { roomCategoryLabel } from "@/lib/format";
import type { RoomType, RoomUnit } from "@/lib/room-management";

/** A spreadsheet row as the API parsed it (POST /room-management/rooms/import/parse). */
export type ImportedRoomRow = {
  rowNumber: number;
  roomId?: string;
  roomCode: string;
  roomType: string;
  buildingName: string;
  floorLabel: string;
};

export type PlannedRoomRow = Omit<ImportedRoomRow, "roomId"> & { roomTypeId: string | null; roomId: string | null; action: "create" | "update" | "unchanged"; error: string | null };

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
function rowError(row: ImportedRoomRow, isRepeat: boolean): string | null {
  if (!row.roomCode) return "Room code is empty";
  if (row.roomCode.length > 100) return "Room code is too long (100 characters at most)";
  if (row.buildingName.length > 120) return "Building is too long (120 characters at most)";
  if (row.floorLabel.length > 80) return "Floor is too long (80 characters at most)";
  if (isRepeat) return "Listed twice in this file";
  return null;
}

/** Checks every row against this property's room types and rooms, the same
 * conflict rule the API applies (room code unique within a building). */
export function planRoomImport(rows: ImportedRoomRow[], roomTypes: RoomType[], existingRooms: RoomUnit[]) {
  const byKey = new Map<string, RoomUnit[]>();
  for (const room of existingRooms) { const key = roomKey(room.roomCode, room.buildingName); byKey.set(key, [...(byKey.get(key) ?? []), room]); }
  const seen = new Set<string>();
  const seenIds = new Set<string>();
  const planned: PlannedRoomRow[] = rows.map((row) => {
    const key = roomKey(row.roomCode, row.buildingName);
    const type = matchRoomType(row.roomType, roomTypes);
    const matches = row.roomId ? existingRooms.filter((room) => room.id === row.roomId) : byKey.get(key) ?? [];
    const existing = matches.length === 1 ? matches[0] : undefined;
    const duplicateId = !!row.roomId && seenIds.has(row.roomId);
    const codeElsewhere = !row.roomId && !row.buildingName && !existing && existingRooms.some((room) => norm(room.roomCode) === norm(row.roomCode));
    const error = rowError(row, seen.has(key) || duplicateId) ?? (codeElsewhere ? "This code exists in another building; specify its building or Room ID" : row.roomId && !existing ? "Room ID does not belong to this property" : matches.length > 1 ? "Several rooms match; include the Room ID to identify the correct one" : existing?.pendingRemoval ? "This room is pending removal" : "error" in type ? type.error : null);
    if (row.roomCode) seen.add(key);
    if (row.roomId) seenIds.add(row.roomId);
    const unchanged = existing && "id" in type && existing.roomTypeId === type.id &&
      existing.roomCode === row.roomCode && (existing.buildingName ?? "") === row.buildingName && (existing.floorLabel ?? "") === row.floorLabel;
    return { ...row, roomId: existing?.id ?? null, roomTypeId: "id" in type ? type.id : null, action: existing ? unchanged ? "unchanged" : "update" : "create", error };
  });

  const groups = new Map<string, RoomImportBatch>();
  for (const row of planned) {
    if (row.error || !row.roomTypeId || row.action !== "create") continue;
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
  const updates = planned.filter((row) => !row.error && row.action === "update").map((row) => ({
    roomId: row.roomId!, roomTypeId: row.roomTypeId!, roomCode: row.roomCode,
    buildingName: row.buildingName || null, floorLabel: row.floorLabel || null,
  }));
  return { rows: planned, batches, updates, validCount: planned.filter((row) => !row.error).length,
    createCount: planned.filter((row) => !row.error && row.action === "create").length,
    updateCount: updates.length, unchangedCount: planned.filter((row) => !row.error && row.action === "unchanged").length };
}
