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
    expect(renderToStaticMarkup(<SignInForm next="/landlords/enroll" />)).not.toContain("Student sign in");
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
    expect(renderToStaticMarkup(<SignInForm next="/landlord" />)).not.toContain("Student sign in");
  });

  it("links an enrolling landlord to the sign-in variant", () => {
    expect(renderToStaticMarkup(<SignInForm next="/landlords/enroll" />)).toContain('href="/sign-in?next=%2Flandlord"');
  });

  it("opens Logto on the register screen for a new landlord", () => {
    expect(renderToStaticMarkup(<SignInForm next="/landlords/enroll" />)).toContain("screen=register");
  });

  it("opens Logto on the sign-in screen for a returning landlord", () => {
    expect(renderToStaticMarkup(<SignInForm next="/landlord" />)).not.toContain("screen=register");
  });

  it("keeps the full chooser without a landlord destination", () => {
    expect(renderToStaticMarkup(<SignInForm next={null} />)).toContain("Student sign in");
  });
});

describe("SignInForm", () => {
  it("shows no staff workspaces on the public sign-in page", () => {
    expect(renderToStaticMarkup(<SignInForm next={null} />)).not.toContain("Administration");
  });

  it("never starts a staff sign-in from the public page", () => {
    expect(renderToStaticMarkup(<SignInForm next={null} />)).not.toContain("portal=staff");
  });

  it("opens Logto on the register screen for a new student", () => {
    expect(renderToStaticMarkup(<SignInForm next={null} />)).toContain("intent=student&amp;screen=register");
  });
});

describe("SignInForm inactivity notice", () => {
  it("explains an inactivity sign-out", () => {
    expect(renderToStaticMarkup(<SignInForm next={null} error="idle_timeout" />))
      .toContain("You were signed out due to inactivity. Sign in again to continue.");
  });

  it("never states how long the timeout is", () => {
    expect(renderToStaticMarkup(<SignInForm next={null} error="idle_timeout" />)).not.toMatch(/minute/i);
  });
});
