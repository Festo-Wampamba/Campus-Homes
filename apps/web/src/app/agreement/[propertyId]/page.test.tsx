import PropertyQrPage from "./page";

const mockRedirect = jest.fn();
const mockSession = jest.fn();

jest.mock("next/navigation", () => ({ redirect: (url: string) => mockRedirect(url) }));
jest.mock("../../../lib/session", () => ({ getServerSession: () => mockSession() }));

afterEach(() => jest.clearAllMocks());

it("sends a signed-out student from a QR poster to create a student account", async () => {
  mockSession.mockResolvedValue(null);
  await PropertyQrPage();
  expect(mockRedirect).toHaveBeenCalledWith("/api/auth/logto/sign-in?portal=consumer&intent=student&screen=register");
});

it("sends an already signed-in student to the student home instead of signing in again", async () => {
  mockSession.mockResolvedValue({ user: { status: "active" }, access: { workspaces: ["student"], onboarding: {} } });
  await PropertyQrPage();
  expect(mockRedirect).toHaveBeenCalledWith("/");
});
