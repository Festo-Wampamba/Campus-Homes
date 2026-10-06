import { renderToStaticMarkup } from "react-dom/server";

import { KycBanner } from "./kyc-banner";

describe("KycBanner", () => {
  it("tells a verified landlord without a live listing that inspection comes next", () => {
    expect(renderToStaticMarkup(<KycBanner status="verified" />)).toContain("schedule an inspection of your property");
  });

  it("does not promise reservations before a listing is live", () => {
    expect(renderToStaticMarkup(<KycBanner status="verified" />)).not.toContain("Students can now reserve");
  });

  it("tells a verified landlord with a live listing that students can reserve", () => {
    expect(renderToStaticMarkup(<KycBanner status="verified" hasLiveListing />)).toContain(
      "Students can now reserve your rooms",
    );
  });

  it("makes no listing claim when listings couldn't be loaded", () => {
    expect(renderToStaticMarkup(<KycBanner status="verified" hasLiveListing={null} />)).not.toContain("inspection");
  });
});
