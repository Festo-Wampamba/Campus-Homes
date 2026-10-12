import { renderToStaticMarkup } from "react-dom/server";

import type { AccountAccess } from "@campushomes/shared";

import { hasVerifiedStaffSession, isStaffPath, StaffSignIn } from "./staff-sign-in";

describe("isStaffPath", () => {
  it.each([
    ["/admin", true],
    ["/admin/users", true],
    ["/admin?tab=roles", true],
    ["/ops/inspect", true],
    ["/admins", false],
    ["/operations", false],
    ["/landlord", false],
    [null, false],
  ])("treats %s as staff: %s", (path, expected) => {
    expect(isStaffPath(path)).toBe(expected);
  });
});

describe("StaffSignIn", () => {
  it("starts an Administration staff sign-in", () => {
    expect(renderToStaticMarkup(<StaffSignIn next={null} />)).toContain("portal=staff&amp;intent=staff&amp;next=%2Fadmin");
  });

  it("starts an Operations staff sign-in", () => {
    expect(renderToStaticMarkup(<StaffSignIn next={null} />)).toContain("portal=staff&amp;intent=staff&amp;next=%2Fops");
  });

  it("keeps a safe admin deep link for Administration only", () => {
    const html = renderToStaticMarkup(<StaffSignIn next="/admin/users" />);
    expect([html.includes("next=%2Fadmin%2Fusers"), html.includes("next=%2Fops\"")]).toEqual([true, true]);
  });

  it("keeps a safe ops deep link for Operations only", () => {
    const html = renderToStaticMarkup(<StaffSignIn next="/ops/inspect" />);
    expect([html.includes("next=%2Fops%2Finspect"), html.includes("next=%2Fadmin\"")]).toEqual([true, true]);
  });

  it("shows the staff MFA error on the staff page", () => {
    expect(renderToStaticMarkup(<StaffSignIn next={null} error="mfa_required" />)).toContain("2-step verification");
  });
});

describe("hasVerifiedStaffSession", () => {
  const access = (workspaces: AccountAccess["workspaces"], mfaVerified: boolean) =>
    ({ workspaces, assurance: { mfaVerified, authenticatedAt: null } }) as unknown as AccountAccess;

  it("skips staff sign-in for an MFA-verified staff session", () => {
    expect(hasVerifiedStaffSession(access(["admin"], true))).toBe(true);
  });

  it("shows staff sign-in to someone signed in as a landlord", () => {
    expect(hasVerifiedStaffSession(access(["landlord"], false))).toBe(false);
  });

  it("shows staff sign-in to staff whose session has not passed MFA", () => {
    expect(hasVerifiedStaffSession(access(["ops"], false))).toBe(false);
  });
});
