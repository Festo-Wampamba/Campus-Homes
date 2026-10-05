import { redirect } from "next/navigation";

import StudentProfilePage from "./page";

jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("../../../lib/student", () => ({ getStudentProfile: jest.fn(async () => ({ university: "MUK" })) }));
jest.mock("../../../lib/session", () => ({
  getServerSession: jest.fn(async () => ({
    user: { status: "active" },
    access: { workspaces: ["student"], roles: [], onboarding: { student: false, landlord: false }, assurance: { authenticatedAt: null, mfaVerified: false } },
  })),
}));
jest.mock("./student-profile-form", () => ({ StudentProfileForm: () => null }));

const render = (next: string) => StudentProfilePage({ searchParams: Promise.resolve({ next }) });

describe("StudentProfilePage next redirect", () => {
  afterEach(() => jest.clearAllMocks());

  it.each(["/%5Cevil.com", "/..//evil.com", "//evil.com", "https://evil.com"])("does not redirect an existing profile to %s", async (next) => {
    await render(next);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects an existing profile to an in-app destination", async () => {
    await render("/listings/abc");
    expect(redirect).toHaveBeenCalledWith("/listings/abc");
  });
});
