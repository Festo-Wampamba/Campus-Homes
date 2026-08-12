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
    process.env.NODE_ENV = originalNodeEnv;
    jest.clearAllMocks();
  });

  it("returns not found in production builds", async () => {
    process.env.NODE_ENV = "production";

    await expect(
      StubCheckoutPage({ params: Promise.resolve({ txRef: "audit-probe" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });
});
