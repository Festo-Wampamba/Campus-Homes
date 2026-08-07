import { homeForAuthenticatedRole, SessionVerificationError } from "./auth-routing";

describe("homeForAuthenticatedRole", () => {
  it.each([
    ["student", "/"],
    ["landlord", "/landlord"],
    ["ops_inspector", "/ops"],
    ["ops_lead", "/ops"],
    ["admin", "/admin"],
  ])("routes %s sessions to %s", (role, expected) => {
    expect(homeForAuthenticatedRole(role)).toBe(expected);
  });

  it.each([undefined, null, "", "unknown"])(
    "rejects an unverified session role (%s)",
    (role) => {
      expect(() => homeForAuthenticatedRole(role)).toThrow(SessionVerificationError);
    },
  );
});
