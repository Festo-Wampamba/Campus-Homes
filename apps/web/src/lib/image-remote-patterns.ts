type RemotePattern = { protocol: "https"; hostname: string; pathname?: string };

// Buckets this project owns. B2 bucket names are globally unique, so pinning
// the path-style bucket segment means no other B2 customer can match.
const OWN_B2_BUCKETS = ["campushomes-media-production", "campushomes-media-staging"];

/**
 * Hosts /_next/image may fetch and transform. Every entry is pinned to an
 * account or bucket we own: the optimizer decodes whatever bytes it fetches,
 * so an open host (any Cloudinary account, any B2 bucket) lets anyone feed it
 * attacker-made images without signing in.
 */
export function imageRemotePatterns(env: Record<string, string | undefined> = process.env): RemotePattern[] {
  const patterns: RemotePattern[] = [
    // Local dev/demo seed data hotlinks sample photos here (scripts/seed-dev.cjs).
    // Unsplash serves only its own transcoded images.
    { protocol: "https", hostname: "images.unsplash.com" },
  ];
  const cloudName = env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (cloudName) patterns.push({ protocol: "https", hostname: "res.cloudinary.com", pathname: `/${cloudName}/**` });

  const endpoint = env.B2_S3_ENDPOINT;
  const bucket = env.B2_BUCKET;
  if (endpoint && bucket) {
    try {
      patterns.push({ protocol: "https", hostname: new URL(endpoint).hostname, pathname: `/${bucket}/**` });
      return patterns;
    } catch {
      /* fall back to the owned buckets below */
    }
  }
  // Path-style hosts only (s3.<region>.backblazeb2.com). Virtual-hosted
  // <bucket>.s3... hosts never start with "s3." because bucket names can't
  // contain dots, so a foreign bucket can't satisfy this hostname.
  for (const own of OWN_B2_BUCKETS) {
    patterns.push({ protocol: "https", hostname: "s3.*.backblazeb2.com", pathname: `/${own}/**` });
  }
  return patterns;
}
