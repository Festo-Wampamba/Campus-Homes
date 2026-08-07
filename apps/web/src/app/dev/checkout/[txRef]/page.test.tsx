import { notFound } from "next/navigation";

import StubCheckoutPage from "./page";

jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  useSearchParams: jest.fn(),
}));

describe("StubCheckoutPage", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    Object.defineProperty(process.env, "NODE_ENV", {
      configurable: true,
      enumerable: true,
      value: originalNodeEnv,
      writable: true,
    });
    jest.clearAllMocks();
  });

  it("returns not found in production builds", async () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      configurable: true,
      enumerable: true,
      value: "production",
      writable: true,
    });

    await expect(
      StubCheckoutPage({ params: Promise.resolve({ txRef: "audit-probe" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });
});
