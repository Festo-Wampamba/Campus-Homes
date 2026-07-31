import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import path from "node:path";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
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
