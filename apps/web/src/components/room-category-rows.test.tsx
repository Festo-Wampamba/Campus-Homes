import { bedsPerRoom, emptyRoomCategoryRow } from "./room-category-rows";

describe("bedsPerRoom", () => {
  it("fixes a double at two beds regardless of the entered value", () => {
    expect(bedsPerRoom({ ...emptyRoomCategoryRow(), category: "double", bedsPerRoom: "6" })).toBe(2);
  });

  it("uses the entered beds for a dormitory", () => {
    expect(bedsPerRoom({ ...emptyRoomCategoryRow(), category: "dormitory", bedsPerRoom: "8" })).toBe(8);
  });

  it("defaults a variable room type to one bed when left blank", () => {
    expect(bedsPerRoom({ ...emptyRoomCategoryRow(), category: "studio" })).toBe(1);
  });
});
