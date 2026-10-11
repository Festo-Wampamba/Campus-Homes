import { photosForRoomType } from "./room-type-photos";

const photos = [
  { storageKey: "exterior", category: "exterior", roomCategory: null, selfContained: null },
  { storageKey: "single-sc-bed", category: "single_bedroom", roomCategory: "single", selfContained: true },
  { storageKey: "single-sc-bath", category: "bathroom", roomCategory: "single", selfContained: true },
  { storageKey: "single-shared", category: "single_bedroom", roomCategory: "single", selfContained: false },
  { storageKey: "double-legacy", category: "double_bedroom", roomCategory: null, selfContained: null },
];

const keys = (list: { storageKey: string }[]) => list.map((p) => p.storageKey);

describe("photosForRoomType", () => {
  it("shows a self-contained single only its own photos, bathroom included", () => {
    expect(keys(photosForRoomType(photos, { category: "single", selfContained: true }))).toEqual([
      "single-sc-bed",
      "single-sc-bath",
    ]);
  });

  it("keeps self-contained photos out of the shared-bathroom version", () => {
    expect(keys(photosForRoomType(photos, { category: "single", selfContained: false }))).toEqual(["single-shared"]);
  });

  it("matches an older unlinked photo by the bedroom type it shows", () => {
    expect(keys(photosForRoomType(photos, { category: "double", selfContained: true }))).toEqual(["double-legacy"]);
  });

  it("never shows whole-property photos under a room type", () => {
    expect(keys(photosForRoomType(photos, { category: "triple", selfContained: false }))).toEqual([]);
  });
});
