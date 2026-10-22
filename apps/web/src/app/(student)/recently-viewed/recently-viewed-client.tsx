"use client";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { listingDetailResponseSchema } from "@campushomes/shared";
import { Clock } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { HostelCard } from "@/components/hostel-card";
import { getRecentlyViewed, type RecentlyViewedEntry } from "@/lib/recently-viewed";
import { listingCardData } from "@/lib/listing-card-data";
import { api } from "@/lib/api";
function subscribe() { return () => {}; }
export function RecentlyViewedClient({savedIds = []}:{savedIds?:string[]}) {
  const entries=useSyncExternalStore(subscribe,getRecentlyViewed,()=>null);
  if(entries === null) return null;
  if(!entries.length) return <div className="mt-6"><EmptyState icon={Clock} title="Nothing viewed yet" body="Hostels you open appear here. This list lives in this browser; favourites stay in your account."/></div>;
  return <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{entries.map(entry => <RecentCard key={entry.id} entry={entry} saved={savedIds.includes(entry.id)}/>)}</div>;
}
function RecentCard({entry,saved}:{entry:RecentlyViewedEntry;saved:boolean}) {
  const query=useQuery({queryKey:["recent-listing",entry.id],queryFn:async()=>listingDetailResponseSchema.parse(await api(`/listings/${entry.id}`)),retry:false,staleTime:60_000});
  const listing=query.data ? listingCardData(query.data) : null;
  if(listing) return <HostelCard listing={listing} canSave saved={saved}/>;
  return <article className="rounded-2xl border border-border bg-card p-6"><h2 className="text-xl">{entry.name}</h2><p className="mt-3 text-muted-foreground">{query.isPending ? "Checking current availability…" : query.isError ? "We couldn’t check this hostel. It may be unavailable." : "No available rooms to show right now."}</p><Link className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary" href={`/listings/${entry.id}`}>View hostel</Link></article>;
}
