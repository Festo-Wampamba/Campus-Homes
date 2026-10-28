import { renderToStaticMarkup } from "react-dom/server";

import { bedsPerRoom, emptyRoomCategoryRow, RoomCategoryRows } from "./room-category-rows";

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

describe("RoomCategoryRows room types", () => {
  const render = (category = "single") =>
    renderToStaticMarkup(<RoomCategoryRows rows={[{ ...emptyRoomCategoryRow(), category: category as never }]} onChange={() => {}} idPrefix="t" />);

  it("no longer offers Bedsitter", () => {
    expect(render()).not.toContain('value="bedsitter"');
  });

  it("still shows Bedsitter for a room that already has it", () => {
    expect(render("bedsitter")).toContain('value="bedsitter"');
  });

  it("shows Studio with a proper label", () => {
    expect(render()).toContain(">Studio</option>");
  });
});

describe("RoomCategoryRows variants", () => {
  it("offers a variant name on a general room type", () => {
    const html = renderToStaticMarkup(<RoomCategoryRows rows={[{ ...emptyRoomCategoryRow(), category: "single" }]} onChange={() => {}} idPrefix="t" />);
    expect(html).toContain('aria-label="Variant name (optional)"');
  });
});
