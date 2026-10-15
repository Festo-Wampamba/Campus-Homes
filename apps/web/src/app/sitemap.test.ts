/** @jest-environment node */
import sitemap from "./sitemap";

const mockApi = jest.fn();
jest.mock("../lib/api", () => ({ api: (...args: unknown[]) => mockApi(...args) }));

process.env.SITE_URL = "https://campushomes.co.ug";

it("asks for no more listings than the search API allows", async () => {
  mockApi.mockResolvedValue([]);

  await sitemap();

  expect(new URLSearchParams(String(mockApi.mock.calls[0][0]).split("?")[1]).get("limit")).toBe("50");
});
