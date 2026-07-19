import type { ListingSearchResult } from "@campushomes/shared";

import { apiServer } from "@/lib/server-api";

export function getSavedListings(): Promise<ListingSearchResult[]> {
  return apiServer<ListingSearchResult[]>("/students/saved-listings").then((rows) => rows ?? []);
}
