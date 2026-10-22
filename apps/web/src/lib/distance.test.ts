import { formatDistance, haversineDistanceMeters, validCoordinates, formatRoadTrip } from "./distance";

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

describe("formatRoadTrip", () => {
  it("states road distance and drive time", () => {
    expect(formatRoadTrip(10032, 1500)).toBe("10.0 km by road · about 25 min drive");
  });

  it("switches to hours for long drives", () => {
    expect(formatRoadTrip(52000, 3900)).toBe("52.0 km by road · about 1 h 5 min drive");
  });
});
