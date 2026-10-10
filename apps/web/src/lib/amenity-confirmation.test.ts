import { amenityGroups, declaredAmenityState } from "./amenity-confirmation";

const property = {
  proposedAmenities: { wifi: true, parking: false, rooftop_garden: true },
  furnishingItems: { bed: true },
  securityFeatures: { security_guard: true, cctv: true },
  accessibilityFeatures: {},
};

describe("declaredAmenityState", () => {
  it("pre-ticks every key the landlord declared across all four checklists", () => {
    expect(declaredAmenityState(property)).toEqual({
      wifi: true,
      rooftop_garden: true,
      bed: true,
      security_guard: true,
      cctv: true,
    });
  });

  it("starts empty when the property couldn't be loaded", () => {
    expect(declaredAmenityState(null)).toEqual({});
  });
});

describe("amenityGroups", () => {
  it("labels a custom landlord amenity from its key", () => {
    const amenities = amenityGroups(property)[0];
    expect(amenities.declared).toContainEqual({ key: "rooftop_garden", label: "Rooftop garden" });
  });

  it("shows a key shared by two groups only once", () => {
    const keys = amenityGroups(property).flatMap((g) => [...g.declared, ...g.others].map((o) => o.key));
    expect(keys.filter((k) => k === "security_guard")).toHaveLength(1);
  });
});
