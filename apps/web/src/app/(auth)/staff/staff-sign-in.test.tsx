import { renderToStaticMarkup } from "react-dom/server";

import { isStaffPath, StaffSignIn } from "./staff-sign-in";

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
