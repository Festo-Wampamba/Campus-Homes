import { APPROVAL_PATH, ONBOARDING_PATH, dashboardGate, setupGate } from "./landlord-gate";

const pending = { kycStatus: "pending" as const };
const verified = { kycStatus: "verified" as const };
const rejected = { kycStatus: "rejected" as const };

describe("dashboardGate", () => {
  it("sends a landlord without a profile to onboarding", () => {
    expect(dashboardGate(null, false)).toBe(ONBOARDING_PATH);
  });

  it("sends a pending landlord with a property to the review page", () => {
    expect(dashboardGate(pending, true)).toBe(APPROVAL_PATH);
  });

  it("sends a pending landlord without a property back to onboarding", () => {
    expect(dashboardGate(pending, false)).toBe(ONBOARDING_PATH);
  });

  it("rejected landlord with a property is sent to the review page", () => {
    expect(dashboardGate(rejected, true)).toBe(APPROVAL_PATH);
  });

  it("verified landlord on the dashboard is not redirected", () => {
    expect(dashboardGate(verified, false)).toBeNull();
  });
});

describe("setupGate", () => {
  it("lets a new landlord stay on onboarding", () => {
    expect(setupGate(null, false, ONBOARDING_PATH)).toBeNull();
  });

  it("profile without a property on the approval page goes to onboarding", () => {
    expect(setupGate(pending, false, APPROVAL_PATH)).toBe(ONBOARDING_PATH);
  });

  it("sends a submitted pending landlord from onboarding to the review page", () => {
    expect(setupGate(pending, true, ONBOARDING_PATH)).toBe(APPROVAL_PATH);
  });

  it("keeps a submitted pending landlord on the review page", () => {
    expect(setupGate(pending, true, `${APPROVAL_PATH}?x=1`)).toBeNull();
  });

  it("sends a verified landlord on the review page to the dashboard", () => {
    expect(setupGate(verified, true, APPROVAL_PATH)).toBe("/landlord");
  });

  it("verified without a property may stay on onboarding", () => {
    expect(setupGate(verified, false, ONBOARDING_PATH)).toBeNull();
  });
});
