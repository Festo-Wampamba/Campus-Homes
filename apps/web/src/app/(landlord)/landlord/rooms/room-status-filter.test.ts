import { roomMatchesStatus } from "./rooms-inventory-tab";

describe("roomMatchesStatus", () => {
  it("counts a partly free room as having free beds", () => {
    expect(roomMatchesStatus("partially_occupied", "has_free_beds")).toBe(true);
  });

  it("counts an empty room as having free beds", () => {
    expect(roomMatchesStatus("available", "has_free_beds")).toBe(true);
  });

  it("excludes a full room from free beds", () => {
    expect(roomMatchesStatus("fully_occupied", "has_free_beds")).toBe(false);
  });

  it("matches an exact status", () => {
    expect(roomMatchesStatus("blocked", "blocked")).toBe(true);
  });

  it("matches every room when no filter is set", () => {
    expect(roomMatchesStatus("fully_occupied", "all")).toBe(true);
  });
});
