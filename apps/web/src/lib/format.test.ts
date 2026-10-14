import { formatAddress, roomSizeLabel } from "./format";

describe("formatAddress", () => {
  it("drops a trailing comma", () => {
    expect(formatAddress("Makerere Hill,")).toBe("Makerere Hill");
  });

  it("keeps commas inside the address", () => {
    expect(formatAddress("Plot 4, Kikoni Road ")).toBe("Plot 4, Kikoni Road");
  });
});

describe("roomSizeLabel", () => {
  it("separates rooms from free beds for search rows", () => {
    expect(roomSizeLabel({ unit_count: 108, room_count: 38, min_capacity: 1, max_capacity: 4 })).toBe(
      "Sleeps 1–4 · 38 rooms · 108 beds free",
    );
  });

  it("keeps the room count for rows without room_count", () => {
    expect(roomSizeLabel({ unit_count: 3, min_capacity: 2, max_capacity: 2 })).toBe("Sleeps 2 · 3 rooms");
  });
});
