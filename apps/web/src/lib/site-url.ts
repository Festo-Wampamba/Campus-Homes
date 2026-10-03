import { headers } from "next/headers";

/**
 * Absolute origin for canonical URLs, the sitemap and social previews.
 * SITE_URL is read at request time (one image is promoted across
 * environments); without it, fall back to the host the request came in on.
 */
export async function getSiteUrl(): Promise<string> {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
