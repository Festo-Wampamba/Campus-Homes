import type { Metadata } from "next";
import { Suspense } from "react";
import { dehydrate, QueryClient } from "@tanstack/react-query";
import { listingSearchPageResponseSchema } from "@campushomes/shared";
import { DiscoveryHydration } from "@/components/discovery-hydration";
import { api } from "@/lib/api";
import { discoveryApiParams } from "@/lib/discovery";
import { getServerSession } from "@/lib/session";
import { getSavedListings } from "@/lib/saved-listings";
import { SearchClient } from "./search-client";

export const metadata: Metadata = {
  title: "Search hostels near Makerere",
  description: "Search inspected student hostels near Makerere University. Compare room types, semester prices, availability and approximate campus distance.",
  alternates: { canonical: "/search" },
};

export default function SearchPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  return <Suspense fallback={<div className="mx-auto max-w-7xl px-4 py-10"><h1 className="text-3xl">Student hostels near Makerere</h1><p role="status" className="mt-4 text-muted-foreground">Finding available hostels…</p></div>}><PrefetchedResults searchParams={searchParams}/></Suspense>;
}

async function PrefetchedResults({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const values=await searchParams;
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(values)) if(typeof value === "string")params.set(key,value);
  params.delete("view");
  const queryClient=new QueryClient();
  const [session]=await Promise.all([
    getServerSession(),
    queryClient.prefetchInfiniteQuery({
      queryKey:["discovery-page",params.toString()],
      initialPageParam:1,
      queryFn:async({pageParam})=>listingSearchPageResponseSchema.parse(await api(`/listings/search-page?${discoveryApiParams(params,pageParam)}`,{signal:AbortSignal.timeout(4000)})),
      staleTime:30_000,
    }),
  ]);
  const canSave=!!(session?.user.status === "active" && session.access.workspaces.includes("student"));
  const saved=canSave?await getSavedListings():[];
  return <DiscoveryHydration state={dehydrate(queryClient)}><SearchClient canSave={canSave} savedIds={saved.map(row=>row.id)}/></DiscoveryHydration>;
}
