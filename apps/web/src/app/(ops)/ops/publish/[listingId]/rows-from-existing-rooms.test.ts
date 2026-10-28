import { rowsFromExistingRooms, type PropertyRoom } from "./publish-listing-form";

const room = (id: string, roomCategoryLabel: string | null): PropertyRoom => ({
  id,
  label: id,
  capacity: 1,
  roomCategory: "single",
  roomCategoryLabel,
  selfContained: false,
  pricePerTermUgx: 900_000,
  depositUgx: null,
});

it("keeps two variants at the same price as separate rows", () => {
  expect(rowsFromExistingRooms([room("a", "Executive"), room("b", "Mini")])).toHaveLength(2);
});

it("carries the variant name into its row", () => {
  expect(rowsFromExistingRooms([room("a", "Executive")])[0]?.customLabel).toBe("Executive");
});

it("still groups rooms of the same variant into one row", () => {
  expect(rowsFromExistingRooms([room("a", "Executive"), room("b", "Executive")])[0]?.roomCount).toBe("2");
});
