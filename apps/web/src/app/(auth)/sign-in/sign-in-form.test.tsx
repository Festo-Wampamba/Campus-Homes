import { renderToStaticMarkup } from "react-dom/server";

import { SignInForm } from "./sign-in-form";

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
