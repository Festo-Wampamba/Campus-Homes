import { renderToStaticMarkup } from "react-dom/server";

import { OnboardingForm } from "./onboarding-form";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));

describe("OnboardingForm", () => {
  it("shows the username field without an @ prefix", () => {
    const html = renderToStaticMarkup(<OnboardingForm initialName="Jane Doe" initialUsername="janedoe" />);

    expect(html).not.toContain(">@<");
  });
});
