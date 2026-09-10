import { signInUrl, signOut } from "./auth";

describe("signInUrl", () => {
  it("binds student and landlord intent to the consumer application", () => {
    expect(signInUrl("consumer", "/search", "student"))
      .toBe("/api/auth/logto/sign-in?portal=consumer&intent=student&next=%2Fsearch");
    expect(signInUrl("consumer", "/landlords/enroll", "landlord"))
      .toBe("/api/auth/logto/sign-in?portal=consumer&intent=landlord&next=%2Flandlords%2Fenroll");
  });

  it("cannot downgrade a staff portal transaction to consumer intent", () => {
    expect(signInUrl("staff", "/admin", "student"))
      .toBe("/api/auth/logto/sign-in?portal=staff&intent=staff&next=%2Fadmin");
  });

  it("keeps legacy landlord enrollment links working", () => {
    expect(signInUrl("consumer", "/landlords/enroll"))
      .toContain("portal=consumer&intent=landlord");
  });
});

describe("signOut", () => {
  const fetchMock = jest.fn();
  const response = (status: number, body: object) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

  beforeEach(() => {
    fetchMock.mockReset();
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "fetch");
  });

  it("returns the provider end-session URL", async () => {
    fetchMock.mockResolvedValue(response(200, {
      redirectUrl: "https://auth.example.test/oidc/session/end",
    }));
    await expect(signOut()).resolves.toBe("https://auth.example.test/oidc/session/end");
    expect(fetch).toHaveBeenCalledWith("/api/auth/logto/sign-out", {
      method: "POST",
      credentials: "include",
    });
  });

  it("falls back to sign-in when the provider has no redirect", async () => {
    fetchMock.mockResolvedValue(response(200, {}));
    await expect(signOut()).resolves.toBe("/sign-in");
  });

  it("does not pretend sign-out succeeded on an HTTP error", async () => {
    fetchMock.mockResolvedValue(response(503, {}));
    await expect(signOut()).rejects.toThrow("Sign-out failed");
  });
});
