import AuthCallbackPage from "./page";

const mockRedirect = jest.fn((url: string) => {
  throw new Error(`REDIRECT ${url}`);
});
jest.mock("next/navigation", () => ({ redirect: (url: string) => mockRedirect(url) }));

const mockSession = jest.fn();
jest.mock("../../../../lib/session", () => ({
  ...jest.requireActual("../../../../lib/session"),
  getServerSession: () => mockSession(),
}));

const STUDENT_ACCESS = { workspaces: ["student"], roles: ["student"], permissions: [], assurance: { mfaVerified: false } };

function session(user: Record<string, unknown>) {
  return {
    user: { id: "u1", role: "student", status: "active", email: "s@example.test", phoneNumber: null, ...user },
    access: STUDENT_ACCESS,
  };
}

async function landingFor(next?: string) {
  await expect(AuthCallbackPage({ searchParams: Promise.resolve({ next }) })).rejects.toThrow(/REDIRECT/);
  return mockRedirect.mock.calls.at(-1)?.[0];
}

beforeEach(() => mockRedirect.mockClear());

it("sends a new account to complete its profile, then back to the page it came from", async () => {
  mockSession.mockResolvedValue(session({ name: "", username: null, contactPhone: null }));

  expect(await landingFor("/listings/abc")).toBe("/onboarding?next=%2Flistings%2Fabc");
});

it("sends a completed account straight to the page it came from", async () => {
  mockSession.mockResolvedValue(session({ name: "Sarah Nakato", username: "sarah_n", contactPhone: "+256772123456" }));

  expect(await landingFor("/listings/abc")).toBe("/listings/abc");
});
