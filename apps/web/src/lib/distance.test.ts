import { formatDistance, haversineDistanceMeters, validCoordinates } from "./distance";

describe("distance helpers", () => {
  it("calculates a known equatorial distance", () => {
    expect(haversineDistanceMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111_195, -1);
  });

  it.each([
    [undefined, { lat: 0, lon: 0 }],
    [{ lat: Number.NaN, lon: 0 }, { lat: 0, lon: 0 }],
    [{ lat: 91, lon: 0 }, { lat: 0, lon: 0 }],
    [{ lat: 0, lon: -181 }, { lat: 0, lon: 0 }],
  ])("returns null for invalid coordinates", (from, to) => {
    expect(validCoordinates(from as { lat: number; lon: number } | undefined)).toBeNull();
    expect(haversineDistanceMeters(from as { lat: number; lon: number } | undefined, to)).toBeNull();
  });

  it("formats both kilometres and metres", () => {
    expect(formatDistance(1_234)).toEqual({ kilometres: "1.2", metres: "1,234" });
    expect(formatDistance(null)).toBeNull();
  });
});
