import { CAMPUS_LOCATIONS } from "@/lib/campuses";

import { nearestCampusCode } from "./campus-listings-tabs";

describe("nearestCampusCode", () => {
  it("picks the campus whose center is closest to the given coordinates", () => {
    const muk = CAMPUS_LOCATIONS.MUK!;
    expect(nearestCampusCode(muk.lat + 0.001, muk.lon + 0.001)).toBe("MUK");
  });

  it("picks a different campus when coordinates sit closer to it", () => {
    const kyu = CAMPUS_LOCATIONS.KYU!;
    expect(nearestCampusCode(kyu.lat, kyu.lon)).toBe("KYU");
  });
});
