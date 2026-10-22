import type { MetadataRoute } from "next";
import { listingSearchResultSchema } from "@campushomes/shared";

import { api } from "@/lib/api";
import { UGANDA_BOUNDS } from "@/lib/campuses";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

const STATIC_PATHS = ["/", "/search", "/landlords", "/how-it-works", "/support", "/contact", "/privacy", "/terms"];

async function listingIds(): Promise<string[]> {
  try {
    const query = new URLSearchParams({
      ...Object.fromEntries(Object.entries(UGANDA_BOUNDS).map(([k, v]) => [k, String(v)])),
      // The search API caps limit at 50; asking for more is a 400, which left
      // every listing out of the sitemap.
      limit: "50",
      university: "MUK",
    });
    const rows = listingSearchResultSchema
      .array()
      .parse(await api<unknown>(`/listings/search?${query}`, { cache: "no-store" }));
    return rows.map((row) => row.id);
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [base, ids] = await Promise.all([getSiteUrl(), listingIds()]);
  return [
    ...STATIC_PATHS.map((path) => ({ url: `${base}${path}` })),
    ...ids.map((id) => ({ url: `${base}/listings/${id}` })),
  ];
}
