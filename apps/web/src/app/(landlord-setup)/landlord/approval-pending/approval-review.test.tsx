import { renderToStaticMarkup } from "react-dom/server";

import { ApprovalReview } from "./approval-review";

jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock("../../../../lib/api", () => ({ api: jest.fn(), ApiError: class ApiError extends Error {} }));

const render = (status: "pending" | "verified" | "rejected") =>
  renderToStaticMarkup(<ApprovalReview initialStatus={status} />);

describe("ApprovalReview", () => {
  it("tells a pending landlord their application is being reviewed", () => {
    expect(render("pending")).toContain("reviewing your application");
  });

  it("promises to open the dashboard automatically", () => {
    expect(render("pending")).toContain("open your dashboard automatically");
  });

  it("animates the stamp only for motion-safe users", () => {
    expect(render("pending")).toContain("motion-safe:animate-stamp-press");
  });

  it("tells an approved landlord the dashboard is opening", () => {
    expect(render("verified")).toContain("Opening your dashboard");
  });

  it("gives a rejected landlord the support email as a link", () => {
    expect(render("rejected")).toContain('href="mailto:support@campushomes.co.ug"');
  });

  it("stops the stamp animation when rejected", () => {
    expect(render("rejected")).not.toContain("animate-stamp-press");
  });

  it("announces status changes politely", () => {
    expect(render("pending")).toContain('aria-live="polite"');
  });
});
