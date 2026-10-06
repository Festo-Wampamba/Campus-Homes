import { renderToStaticMarkup } from "react-dom/server";

import { AccountSettingsNav } from "./account-settings-nav";

describe("AccountSettingsNav", () => {
  it.each([
    ["#personal", "Personal details"],
    ["#identity", "Identity &amp; verification"],
    ["#contact", "Contact &amp; emergency"],
    ["#security", "Sign-in &amp; security"],
  ])("links %s to the %s section", (href, label) => {
    expect(renderToStaticMarkup(<AccountSettingsNav />)).toMatch(new RegExp(`href="${href}"[^>]*>${label}</a>`));
  });
});
