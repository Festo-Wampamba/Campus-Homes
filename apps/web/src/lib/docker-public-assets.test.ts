import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("web production image", () => {
  it("packages the Next.js public directory in the runtime container", () => {
    const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf8");

    expect(dockerfile).toMatch(
      /COPY --from=builder --chown=node:node \/workspace\/apps\/web\/public \.\/apps\/web\/public/,
    );
  });

  it("keeps the configured API origin available to server-rendered routes at runtime", () => {
    const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf8");
    const runnerStage = dockerfile.split("FROM node:24-bookworm-slim AS runner")[1];

    expect(runnerStage).toBeDefined();
    expect(runnerStage).toMatch(/ARG NEXT_PUBLIC_API_BASE_URL/);
    expect(runnerStage).toMatch(/ENV NEXT_PUBLIC_API_BASE_URL=\$NEXT_PUBLIC_API_BASE_URL/);
  });

  it("bakes the build commit into the runtime image for the deploy health gate", () => {
    const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf8");

    expect(dockerfile).toMatch(/ARG GIT_COMMIT_SHA=unknown/);
    expect(dockerfile).toMatch(/echo "\$GIT_COMMIT_SHA" > \/workspace\/commit_sha\.txt/);
    expect(dockerfile).toMatch(
      /COPY --from=builder --chown=node:node \/workspace\/commit_sha\.txt \.\/apps\/web\/commit_sha\.txt/,
    );
  });
});
