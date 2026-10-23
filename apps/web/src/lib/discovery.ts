import type { ListingSearchResult } from "@campushomes/shared";
import { ENABLED_CAMPUSES, UGANDA_BOUNDS } from "@/lib/campuses";
import { haversineDistanceMeters } from "@/lib/distance";

export type DiscoverySort = "price_asc" | "price_desc" | "distance_asc";
export type DiscoveryFilters = {
  q: string; campus: string; minPriceUgx: string; maxPriceUgx: string;
  genderArrangement: string; roomCategory: string; selfContained: string;
  sort: DiscoverySort;
};
export type DiscoveryPage = { items: ListingSearchResult[]; total: number; page: number; pageSize: number; hasMore: boolean };
export const DEFAULT_DISCOVERY: DiscoveryFilters = { q: "", campus: "MUK", minPriceUgx: "", maxPriceUgx: "", genderArrangement: "", roomCategory: "", selfContained: "", sort: "price_asc" };
export const FILTER_KEYS = ["minPriceUgx", "maxPriceUgx", "genderArrangement", "roomCategory", "selfContained"] as const;

export function discoveryFromParams(params: URLSearchParams): DiscoveryFilters {
  const sort = params.get("sort");
  return {
    ...DEFAULT_DISCOVERY,
    q: (params.get("q") ?? "").trim().slice(0, 100),
    campus: ENABLED_CAMPUSES.find((c) => c.code === params.get("campus"))?.code ?? "MUK",
    minPriceUgx: positivePrice(params.get("minPriceUgx")), maxPriceUgx: positivePrice(params.get("maxPriceUgx")),
    genderArrangement: ["male_only", "female_only", "mixed"].includes(params.get("genderArrangement") ?? "") ? params.get("genderArrangement")! : "",
    roomCategory: ["single", "double", "triple", "quad", "studio", "self_contained", "bedsitter", "dormitory", "other"].includes(params.get("roomCategory") ?? "") ? params.get("roomCategory")! : "",
    selfContained: ["true", "false"].includes(params.get("selfContained") ?? "") ? params.get("selfContained")! : "",
    sort: sort === "price_desc" || sort === "distance_asc" ? sort : "price_asc",
  };
}
function positivePrice(value: string | null) { return value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 2147483647 ? value : ""; }
export function budgetError(filters: Pick<DiscoveryFilters, "minPriceUgx" | "maxPriceUgx">) {
  for (const value of [filters.minPriceUgx, filters.maxPriceUgx]) {
    if (value && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > 2147483647)) return "Enter whole UGX amounts between 1 and 2,147,483,647.";
  }
  return filters.minPriceUgx && filters.maxPriceUgx && Number(filters.minPriceUgx) > Number(filters.maxPriceUgx) ? "Minimum price must not exceed maximum price." : null;
}
export function discoveryParams(filters: DiscoveryFilters, original?: URLSearchParams) {
  const params = new URLSearchParams(original);
  for (const [key, value] of Object.entries(filters)) {
    if (value && !(key === "sort" && value === "price_asc")) params.set(key, value); else params.delete(key);
  }
  return params;
}
export function discoveryApiParams(params: URLSearchParams, page = 1) {
  const filters = discoveryFromParams(params);
  const query = new URLSearchParams({ university: filters.campus, page: String(page), limit: "20", sort: filters.sort });
  for (const [key, fallback] of Object.entries(UGANDA_BOUNDS)) {
    const raw = params.get(key); const value = raw !== null ? Number(raw) : NaN;
    query.set(key, String(Number.isFinite(value) ? value : fallback));
  }
  for (const key of ["q", ...FILTER_KEYS] as const) if (filters[key]) query.set(key, filters[key]);
  return query;
}
export function approximateCampusDistance(lat: number | null, lon: number | null, code = "MUK") {
  const campus = ENABLED_CAMPUSES.find((c) => c.code === code);
  return haversineDistanceMeters({lat,lon},campus);
}
