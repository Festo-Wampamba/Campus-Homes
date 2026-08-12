import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("web production image", () => {
  it("packages the Next.js public directory in the runtime container", () => {
    const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf8");

    expect(dockerfile).toMatch(
      /COPY --from=builder --chown=node:node \/workspace\/apps\/web\/public \.\/apps\/web\/public/,
    );
  });
});
