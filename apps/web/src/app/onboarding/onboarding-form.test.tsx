import { renderToStaticMarkup } from "react-dom/server";

import { OnboardingForm } from "./onboarding-form";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));

describe("OnboardingForm", () => {
  it("shows the username field without an @ prefix", () => {
    const html = renderToStaticMarkup(<OnboardingForm initialName="Jane Doe" initialUsername="janedoe" initialPhone="" next="/choose-workspace" />);

    expect(html).not.toContain(">@<");
  });

  it("asks for a phone number", () => {
    const html = renderToStaticMarkup(<OnboardingForm initialName="" initialUsername="" initialPhone="" next="/choose-workspace" />);
    expect(html).toContain('id="onboarding-phone"');
  });

  it("pre-fills a phone the account already has", () => {
    const html = renderToStaticMarkup(<OnboardingForm initialName="" initialUsername="" initialPhone="+256772123456" next="/choose-workspace" />);
    expect(html).toContain('value="772123456"');
  });

  it("asks students and landlords to choose a gender", () => {
    const html = renderToStaticMarkup(<OnboardingForm initialName="" initialUsername="" initialPhone="" askGender next="/choose-workspace" />);
    expect(html).toMatch(/<select[^>]*id="onboarding-gender"[^>]*required/);
  });

  it("does not ask staff for a gender", () => {
    const html = renderToStaticMarkup(<OnboardingForm initialName="" initialUsername="" initialPhone="" next="/choose-workspace" />);
    expect(html).not.toContain('id="onboarding-gender"');
  });

  it("pre-selects a gender the account already has", () => {
    const html = renderToStaticMarkup(<OnboardingForm initialName="" initialUsername="" initialPhone="" askGender initialGender="male" next="/choose-workspace" />);
    expect(html).toMatch(/<option value="male" selected/);
  });

  it("shows example hints as placeholders, not as pre-filled values", () => {
    const html = renderToStaticMarkup(<OnboardingForm initialName="" initialUsername="" initialPhone="" next="/choose-workspace" />);
    expect(html).toContain('placeholder="e.g. Muwanguzi Festo"');
  });
});
