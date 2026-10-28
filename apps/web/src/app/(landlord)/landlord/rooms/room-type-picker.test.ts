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
