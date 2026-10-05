import { renderToStaticMarkup } from "react-dom/server";

import { SignInForm, signInMode } from "./sign-in-form";

describe("signInMode", () => {
  it.each([
    ["/landlords/enroll", "landlord-create"],
    ["/landlord", "landlord-signin"],
    ["/landlord/bookings", "landlord-signin"],
    ["/landlords", "all"],
    [null, "all"],
  ])("maps next=%s to %s", (next, mode) => {
    expect(signInMode(next)).toBe(mode);
  });
});

describe("SignInForm landlord mode", () => {
  it("offers only landlord account creation when coming to enrol", () => {
    expect(renderToStaticMarkup(<SignInForm next="/landlords/enroll" />)).toContain("Create landlord account");
  });

  it("hides student housing when coming to enrol", () => {
    expect(renderToStaticMarkup(<SignInForm next="/landlords/enroll" />)).not.toContain("Find student housing");
  });

  it("hides staff workspaces when coming to enrol", () => {
    expect(renderToStaticMarkup(<SignInForm next="/landlords/enroll" />)).not.toContain("Administration");
  });

  it("offers sign-in to manage properties when coming to the dashboard", () => {
    expect(renderToStaticMarkup(<SignInForm next="/landlord" />)).toContain("Sign in to manage my properties");
  });

  it("keeps a landlord deep link as the sign-in destination", () => {
    expect(renderToStaticMarkup(<SignInForm next="/landlord/bookings" />)).toContain("next=%2Flandlord%2Fbookings");
  });

  it("hides student housing when coming to the dashboard", () => {
    expect(renderToStaticMarkup(<SignInForm next="/landlord" />)).not.toContain("Find student housing");
  });

  it("links an enrolling landlord to the sign-in variant", () => {
    expect(renderToStaticMarkup(<SignInForm next="/landlords/enroll" />)).toContain('href="/sign-in?next=%2Flandlord"');
  });

  it("keeps the full chooser without a landlord destination", () => {
    expect(renderToStaticMarkup(<SignInForm next={null} />)).toContain("Find student housing");
  });
});

describe("SignInForm", () => {
  it("offers distinct Administration and Operations staff entry points", () => {
    const html = renderToStaticMarkup(<SignInForm next={null} />);

    expect(html).toContain("Administration");
    expect(html).toContain("Operations");
    expect(html).toContain("portal=staff&amp;intent=staff&amp;next=%2Fadmin");
    expect(html).toContain("portal=staff&amp;intent=staff&amp;next=%2Fops");
  });

  it("preserves a safe staff destination only for its matching workspace", () => {
    const adminHtml = renderToStaticMarkup(<SignInForm next="/admin/users" />);
    const opsHtml = renderToStaticMarkup(<SignInForm next="/ops/inspect" />);

    expect(adminHtml).toContain("next=%2Fadmin%2Fusers");
    expect(adminHtml).toContain("next=%2Fops");
    expect(opsHtml).toContain("next=%2Fadmin");
    expect(opsHtml).toContain("next=%2Fops%2Finspect");
  });
});
