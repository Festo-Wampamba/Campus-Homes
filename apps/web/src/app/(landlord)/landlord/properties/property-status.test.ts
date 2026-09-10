import { propertyStatusPresentation } from "./property-status";

describe("landlord property status presentation", () => {
  it.each([
    ["pending_kyc", "Pending verification", "warning"],
    ["active", "Active", "success"],
    ["suspended", "Suspended", "destructive"],
  ])("maps %s to an accessible status chip", (status, label, tone) => {
    expect(propertyStatusPresentation(status)).toEqual({ label, tone });
  });
});
