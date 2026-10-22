"use client";
import { HydrationBoundary, useQueryClient, type DehydratedState, type InfiniteData } from "@tanstack/react-query";
import type { ListingSearchPageResponse } from "@campushomes/shared";

/** A URL-only map switch must not replace several loaded pages with a
 * fresh server-prefetched first page. Normal query invalidation still wins. */
export function DiscoveryHydration({state,children}:{state:DehydratedState;children:React.ReactNode}) {
  const client=useQueryClient();
  const queries=state.queries.filter(query=>{
    if(query.queryKey[0]!=="discovery-page")return true;
    const cached=client.getQueryState<InfiniteData<ListingSearchPageResponse>>(query.queryKey);
    return !(cached?.data && cached.data.pages.length>1 && !cached.isInvalidated);
  });
  return <HydrationBoundary state={{...state,queries}}>{children}</HydrationBoundary>;
}
