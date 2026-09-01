import type { MetadataRoute } from "next";

// Read at request time, not build time: the same image is promoted between
// environments, so a value baked at build would follow the image around.
export const dynamic = "force-dynamic";

/**
 * Search-engine policy for the whole web app.
 *
 * Fail-safe: indexing is OFF unless an environment explicitly opts in with
 * ALLOW_INDEXING=true. Staging had no robots.txt and no X-Robots-Tag at all,
 * so the full staging site — sign-in, reservation and profile flows included
 * — was openly crawlable on a brand-new domain. Google's Safe Browsing then
 * classified campushomes.co.ug as "some pages are unsafe / tries to trick
 * visitors into sharing personal info", which propagates to every subdomain
 * and is what produced the Chrome interstitial on api-staging.
 *
 * Defaulting to "block" rather than "allow" means a new environment can never
 * repeat this by omission; only a deliberate production deploy is indexable.
 *
 * PRODUCTION MUST SET ALLOW_INDEXING=true or the public site will not rank.
 */
export default function robots(): MetadataRoute.Robots {
  if (process.env.ALLOW_INDEXING !== "true") {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [
      {
        userAgent: "*",
        // Authenticated portals and the auth handshake carry no public value
        // and are exactly the pages that read as credential harvesting to an
        // automated classifier.
        disallow: ["/api/", "/auth/", "/admin", "/ops", "/landlord", "/student", "/messages", "/calendar", "/profile"],
      },
    ],
  };
}
