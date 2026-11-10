import { renderToStaticMarkup } from "react-dom/server";

import PropertyQrPage from "./page";

const mockRedirect = jest.fn();
const mockSession = jest.fn();

jest.mock("next/navigation", () => ({ redirect: (url: string) => mockRedirect(url) }));
jest.mock("../../../lib/session", () => ({ getServerSession: () => mockSession() }));

afterEach(() => jest.clearAllMocks());

const studentSession = { user: { status: "active" }, access: { workspaces: ["student"], onboarding: {} } };
/** The href of the choice whose text matches, from the rendered page. */
async function link(name: RegExp): Promise<string | undefined> {
  const page = document.createElement("div");
  page.innerHTML = renderToStaticMarkup(await PropertyQrPage());
  return [...page.querySelectorAll("a")].find((a) => name.test(a.textContent ?? ""))?.getAttribute("href") ?? undefined;
}

it("sends a signed-out resident to create an account and come back to link their booking", async () => {
  mockSession.mockResolvedValue(null);
  expect(await link(/already live here/i)).toBe("/api/auth/logto/sign-in?portal=consumer&intent=student&next=%2Factivate&screen=register");
});

it("sends a signed-out new applicant to create a student account", async () => {
  mockSession.mockResolvedValue(null);
  expect(await link(/looking for a room/i)).toBe("/api/auth/logto/sign-in?portal=consumer&intent=student&screen=register");
});

it("takes a signed-in student resident straight to the code page", async () => {
  mockSession.mockResolvedValue(studentSession);
  expect(await link(/already live here/i)).toBe("/activate");
});

it("sends a signed-in landlord to their own workspace", async () => {
  mockSession.mockResolvedValue({ user: { status: "active" }, access: { workspaces: ["landlord"], roles: ["landlord"], onboarding: {}, assurance: {} } });
  await PropertyQrPage();
  expect(mockRedirect).toHaveBeenCalledWith("/landlord");
});
