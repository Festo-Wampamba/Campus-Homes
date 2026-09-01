import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import path from "node:path";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  // Staging served no security headers and advertised `X-Powered-By: Next.js`
  // — verified against the live response headers. The sign-in page starts a
  // credential flow, so clickjacking and referrer leakage are real exposures
  // here, not theoretical. CSP is deliberately omitted: this app runs inline
  // Next bootstrap scripts, and a wrong CSP breaks the page silently, so it
  // needs its own nonce-based pass rather than being guessed at here.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Belt-and-braces with src/app/robots.ts: robots.txt is advisory and
          // only covers crawling, while X-Robots-Tag also suppresses indexing
          // of already-known URLs and of non-HTML responses. Same fail-safe
          // default — blocked unless ALLOW_INDEXING=true.
          ...(process.env.ALLOW_INDEXING === "true"
            ? []
            : [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]),
        ],
      },
    ];
  },
  // The web app imports workspace packages outside apps/web. Include the
  // monorepo root in Next's file tracing so the standalone image contains
  // every runtime file those packages need.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      // Local dev/demo seed data hotlinks sample photos here instead of
      // requiring a Cloudinary account (scripts/seed-dev.cjs) — real listing
      // photos always come from res.cloudinary.com above.
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

export default withNextIntl(nextConfig);
