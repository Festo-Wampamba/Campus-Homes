/**
 * @jest-environment node
 */
import { GET } from "./route";

describe("GET /version", () => {
  it("reports unknown when no commit_sha.txt was baked into the image", async () => {
    const response = GET();
    const body = (await response.json()) as { commit: string };

    expect(body.commit).toBe("unknown");
  });
});
