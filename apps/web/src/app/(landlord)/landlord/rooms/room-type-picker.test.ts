import type { RoomType } from "@/lib/room-management";

import { resolveRoomTypeId, roomTypeOptionLabel } from "./room-type-picker";

const roomType = (id: string, title: string, capacity: number) =>
  ({ id, currentVersion: { title, capacity }, pendingVersion: null }) as unknown as RoomType;

const TYPES = [roomType("a", "Single Room - Executive", 1), roomType("b", "Double Room", 2)];

it("keeps a choice that is still in the list", () => {
  expect(resolveRoomTypeId(TYPES, "b")).toBe("b");
});

it("falls back to the first room type when the remembered one is gone", () => {
  expect(resolveRoomTypeId(TYPES, "from-another-property")).toBe("a");
});

it("says bed, not beds, for a one-bed room type", () => {
  expect(roomTypeOptionLabel(TYPES[0]!)).toBe("Single Room - Executive (1 bed)");
});

it('distinguishes same-name room types by description and keeps their IDs', () => {
  const twins = [roomType('a', 'Single', 1), roomType('b', 'Single', 1)];
  twins[0]!.currentVersion!.description = 'Ground floor, courtyard';
  twins[1]!.currentVersion!.description = 'Upper floor, balcony';
  expect(roomTypeOptionLabel(twins[0]!, twins)).toContain('Ground floor, courtyard');
  expect(roomTypeOptionLabel(twins[1]!, twins)).toContain('Upper floor, balcony');
  expect(resolveRoomTypeId(twins, 'b')).toBe('b');
});
