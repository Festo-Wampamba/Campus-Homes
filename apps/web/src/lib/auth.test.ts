import { signOut } from "./auth";

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
