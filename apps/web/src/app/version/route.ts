import { readFileSync } from "node:fs";
import { join } from "node:path";

// Baked in at image build time (apps/web/Dockerfile) so the deploy health
// gate can tell a new rollout apart from the outgoing container it replaced —
// same reasoning as apps/api/src/modules/health/health.controller.ts.
function readCommitSha(): string {
  try {
    return readFileSync(join(process.cwd(), "commit_sha.txt"), "utf8").trim();
  } catch {
    return "unknown";
  }
}

const COMMIT_SHA = readCommitSha();

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ commit: COMMIT_SHA });
}
