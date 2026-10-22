"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { SlidersHorizontal, Map, List, X, SearchX } from "lucide-react";
import { GENDER_ARRANGEMENTS, SELECTABLE_ROOM_CATEGORIES, listingSearchPageResponseSchema } from "@campushomes/shared";
import { HostelCard } from "@/components/hostel-card";
import { DiscoverySearch } from "@/components/discovery-search";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { budgetError, DEFAULT_DISCOVERY, discoveryApiParams, discoveryFromParams, discoveryParams, FILTER_KEYS, type DiscoveryFilters } from "@/lib/discovery";
import { ENABLED_CAMPUSES } from "@/lib/campuses";
import { formatUgx, GENDER_ARRANGEMENT_LABELS, roomCategoryLabel } from "@/lib/format";
import type { MapBounds } from "@/components/map/listings-map";
import { MapFallbackBoundary } from "@/components/map/map-fallback-boundary";
import { cn } from "@/lib/utils";

const ListingsMap = dynamic(() => import("@/components/map/listings-map").then(m => m.ListingsMap), { ssr: false, loading: () => <div className="h-full animate-pulse bg-muted" aria-label="Loading map" /> });
const desktopQuery = "(min-width: 1280px)";
function subscribeViewport(callback: () => void) { const media=window.matchMedia(desktopQuery); media.addEventListener("change",callback); return () => media.removeEventListener("change",callback); }
function viewportSnapshot() { return window.matchMedia(desktopQuery).matches; }

export function SearchClient({ canSave = false, savedIds = [] }: { canSave?: boolean; savedIds?: string[] }) {
  const params = useSearchParams(); const router=useRouter(); const pathname=usePathname(); const raw=params.toString();
  const searchKey = useMemo(() => { const value = new URLSearchParams(raw); value.delete("view"); return value.toString(); }, [raw]);
  const applied=useMemo(() => discoveryFromParams(new URLSearchParams(raw)),[raw]);
  const [draft,setDraft]=useState(applied); const [filtersOpen,setFiltersOpen]=useState(false);
  const [hideMap,setHideMap]=useState(false);
  const [selected,setSelected]=useState<string|null>(null); const [pendingBounds,setPendingBounds]=useState<MapBounds|null>(null);
  const desktop=useSyncExternalStore(subscribeViewport,viewportSnapshot,()=>false);
  const mapOpen=desktop ? !hideMap : params.get("view")==="map";
  const explicitBounds = ["minLat","minLon","maxLat","maxLon"].every(key => params.has(key) && Number.isFinite(Number(params.get(key))))
    ? {minLat:Number(params.get("minLat")),minLon:Number(params.get("minLon")),maxLat:Number(params.get("maxLat")),maxLon:Number(params.get("maxLon"))} : undefined;
  const query=useInfiniteQuery({queryKey:["discovery-page",searchKey],initialPageParam:1, staleTime:30_000,
    queryFn:async ({pageParam}) => listingSearchPageResponseSchema.parse(await api(`/listings/search-page?${discoveryApiParams(new URLSearchParams(raw),pageParam)}`)),
    getNextPageParam:(last) => last.hasMore ? last.page+1 : undefined,
  });
  const rows=useMemo(() => { const seen=new Set<string>(); return query.data?.pages.flatMap(p=>p.items).filter(r => !seen.has(r.id) && Boolean(seen.add(r.id))) ?? []; },[query.data]);
  const total=query.data?.pages[0]?.total ?? 0; const filterCount=FILTER_KEYS.filter(k=>applied[k]).length;
  const focusResult = useRef<string | null>(null);
  const restore=useRef<{pages:number;y:number}|null>(null); const restoreKey=`campushomes:search:${searchKey}`;
  useEffect(() => {
    try {
      const value = sessionStorage.getItem(restoreKey);
      sessionStorage.removeItem(restoreKey);
      const parsed = value ? JSON.parse(value) : null;
      restore.current = parsed && Number.isInteger(parsed.pages) && parsed.pages > 0 && Number.isFinite(parsed.y) ? parsed : null;
    } catch { restore.current = null; }
  }, [restoreKey]);
  const {data: pageData, hasNextPage, isFetchingNextPage, fetchNextPage} = query;
  useEffect(() => {
    const target = restore.current;
    if (!target || !pageData) return;
    if (pageData.pages.length < target.pages && hasNextPage && !isFetchingNextPage) { void fetchNextPage(); return; }
    if (!isFetchingNextPage) {
      const frame = requestAnimationFrame(() => window.scrollTo(0,target.y));
      restore.current = null;
      return () => cancelAnimationFrame(frame);
    }
  }, [pageData,hasNextPage,isFetchingNextPage,fetchNextPage]);
  useEffect(() => {
    if (!focusResult.current || (!desktop && mapOpen)) return;
    const id = focusResult.current;
    const frame = requestAnimationFrame(() => document.getElementById(`hostel-${id}`)?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",block:"center"}));
    focusResult.current = null;
    return () => cancelAnimationFrame(frame);
  }, [selected,mapOpen,desktop]);
  function navigate(next:URLSearchParams) { router.push(`${pathname}?${next}`,{scroll:false}); }
  function apply() { if(budgetError(draft))return; navigate(discoveryParams(draft,new URLSearchParams(raw))); setFiltersOpen(false); }
  function remember() { try { sessionStorage.setItem(restoreKey,JSON.stringify({pages:query.data?.pages.length ?? 1,y:window.scrollY})); } catch {} }
  const markers=rows.map(r=>({id:r.id,lat:r.gps_lat,lon:r.gps_lon,label:formatUgx(r.price_per_term_ugx),displayLabel:new Intl.NumberFormat("en-UG",{notation:"compact",maximumFractionDigits:1}).format(r.price_per_term_ugx)}));
  const campus=ENABLED_CAMPUSES.find(c=>c.code===applied.campus) ?? ENABLED_CAMPUSES[0];
  return <div className="ch-search-page">
    <div className={cn("ch-search-layout",desktop && mapOpen && "ch-search-layout--map")}>
      <section aria-label="Search results" className={cn("ch-search-results",!desktop && mapOpen && "hidden")}>
        <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground"><Link href="/" className="hover:underline">Home</Link> <span aria-hidden> / </span> {campus.name}</nav>
        <h1 className="text-2xl font-semibold sm:text-3xl">{applied.q ? `Hostels matching “${applied.q}”` : "Student hostels near Makerere"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Inspected in person. Priced per bed, per semester.</p>
        <div className="mt-5"><DiscoverySearch key={applied.q} initialQuery={applied.q} /></div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-b border-border pb-5">
          <Button variant="secondary" onClick={()=>{setDraft(applied);setFiltersOpen(true);}}><SlidersHorizontal aria-hidden className="size-4" />All filters{filterCount ? ` (${filterCount})` : ""}</Button>
          <span className="rounded-full border border-border px-4 py-3 text-sm">Makerere</span>
          <Button variant="ghost" onClick={()=>navigate(discoveryParams({...DEFAULT_DISCOVERY,q:applied.q},new URLSearchParams(raw)))} disabled={!filterCount}>Clear filters</Button>
          <Button variant="secondary" className={cn(desktop && mapOpen && "hidden")} onClick={()=>{if(desktop){setHideMap(false);return;}const next=new URLSearchParams(raw);next.set("view","map");navigate(next);}}><Map aria-hidden className="size-4" />Map</Button>
        </div>
        {filterCount > 0 && <div className="mt-4 flex flex-wrap gap-2" aria-label="Applied filters">
          {FILTER_KEYS.filter(key => applied[key]).map(key => {
            const label = key === "minPriceUgx" ? `From ${formatUgx(Number(applied[key]))}` : key === "maxPriceUgx" ? `Up to ${formatUgx(Number(applied[key]))}` : key === "genderArrangement" ? GENDER_ARRANGEMENT_LABELS[applied[key]] : key === "roomCategory" ? roomCategoryLabel(applied[key]) : applied[key] === "true" ? "Self-contained" : "Shared bathroom";
            return <Button key={key} variant="secondary" size="sm" aria-label={`Remove filter: ${label}`} onClick={() => navigate(discoveryParams({...applied,[key]:""},new URLSearchParams(raw)))}>{label}<X aria-hidden className="size-4"/></Button>;
          })}
        </div>}
        <div className="flex flex-wrap items-center justify-between gap-3 py-5">
          <p aria-live="polite" className="text-sm text-muted-foreground">{query.isPending ? "Finding available hostels…" : query.isError ? "Results unavailable" : `${total} ${total===1?"hostel":"hostels"} found`}</p>
          <label className="flex items-center gap-2 text-sm">Sort by<select aria-label="Sort hostels" value={applied.sort} onChange={e=>navigate(discoveryParams({...applied,sort:e.target.value as DiscoveryFilters["sort"]},new URLSearchParams(raw)))} className="min-h-11 max-w-48 rounded-xl border border-border bg-card px-3"><option value="price_asc">Lowest price</option><option value="price_desc">Highest price</option><option value="distance_asc">Nearest campus</option></select></label>
        </div>
        {query.isPending && <div className="space-y-5" aria-label="Loading hostels">{[1,2,3].map(i=><div key={i} className="h-72 animate-pulse rounded-2xl bg-muted" />)}</div>}
        {query.isError && <div role="alert" className="rounded-2xl border border-border p-8"><h2 className="text-xl">We couldn&apos;t load the hostels</h2><p className="mt-2 text-muted-foreground">Your search is still here. Check your connection and try again.</p><Button className="mt-4" onClick={()=>void query.refetch()}>Try again</Button></div>}
        {!query.isPending && !query.isError && rows.length===0 && <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center"><SearchX aria-hidden className="mx-auto size-9 text-primary" /><h2 className="mt-4 text-xl">{filterCount || applied.q ? "No hostels match this search" : "No available inspected hostels here yet"}</h2><p className="mx-auto mt-3 max-w-md text-muted-foreground">{filterCount || applied.q ? "Try a wider budget, a different room type or another area near Makerere." : "New hostels appear after inspection. You can check another area or ask our team for help."}</p><div className="mt-5 flex flex-wrap justify-center gap-3"><Button variant="secondary" onClick={()=>navigate(new URLSearchParams({campus:"MUK"}))}>Reset search</Button><Link href="/support" className="inline-flex min-h-11 items-center rounded-lg px-4 font-semibold text-primary">Get help</Link></div></div>}
        <div className="space-y-5" onClickCapture={(e)=>{if((e.target as HTMLElement).closest('a[href^="/listings/"]'))remember();}}>{rows.map((row,index)=><div key={row.id} id={`hostel-${row.id}`} className={cn("rounded-2xl scroll-mt-24",selected===row.id&&"ring-2 ring-primary ring-offset-2")} onMouseEnter={()=>setSelected(row.id)}><HostelCard listing={row} priority={index===0} layout="vertical" canSave={canSave} saved={savedIds.includes(row.id)} /></div>)}</div>
        {rows.length>0 && <div className="mt-7 text-center"><p className="mb-3 text-sm text-muted-foreground">Showing {rows.length} of {total} hostels</p>{query.hasNextPage && <Button variant="secondary" disabled={query.isFetchingNextPage} onClick={()=>void query.fetchNextPage()}>{query.isFetchingNextPage?"Loading more…":"Load more hostels"}</Button>}</div>}
      </section>
      {mapOpen && <aside className="ch-search-map" aria-label="Hostel map">
        <div className="absolute inset-x-3 top-3 z-1 flex flex-wrap gap-2"><Button variant="secondary" onClick={()=>{if(desktop){setHideMap(true);return;}const next=new URLSearchParams(raw);next.delete("view");navigate(next);}}>{desktop ? <><X aria-hidden className="size-4"/>Hide map</> : <><List aria-hidden className="size-4"/>List</>}</Button>{pendingBounds && <Button className="shadow-md" onClick={()=>{const next=new URLSearchParams(raw);for(const[k,v]of Object.entries(pendingBounds))next.set(k,String(v));navigate(next);setPendingBounds(null);}}>Search this area</Button>}</div>
        <MapFallbackBoundary><ListingsMap markers={markers} selectedId={selected} onSelect={id=>{focusResult.current=id;setSelected(id); if(!desktop){const next=new URLSearchParams(raw);next.delete("view");navigate(next);}}} onBoundsChange={setPendingBounds} className="h-full" initialCenter={[campus.lon,campus.lat]} initialBounds={explicitBounds} /></MapFallbackBoundary>
        <p className="absolute bottom-8 left-3 rounded-md bg-card/95 p-2 text-xs text-muted-foreground">Pins show loaded results. Prices in UGX per bed, per semester.</p>
      </aside>}
    </div>
    <Dialog open={filtersOpen} onOpenChange={setFiltersOpen} aria-label="Filter hostels" className="max-xl:m-0 max-xl:h-dvh max-xl:max-h-dvh max-xl:w-screen max-xl:max-w-none max-xl:rounded-none"><DialogHeader title="Filter hostels" description="Find the room arrangement and semester budget that suit you." onClose={()=>setFiltersOpen(false)} /><DialogBody>
      <div className="space-y-6"><label className="block text-sm font-semibold">University<select value={draft.campus} onChange={e=>setDraft({...draft,campus:e.target.value})} className="mt-2 min-h-12 w-full rounded-xl border border-border bg-card px-3">{ENABLED_CAMPUSES.map(c=><option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
        <fieldset><legend className="font-semibold">Semester budget · UGX per bed</legend><div className="mt-3 grid grid-cols-2 gap-3">{([['minPriceUgx','Minimum price'],['maxPriceUgx','Maximum price']] as const).map(([key,label])=><label key={key} className="text-sm">{label}<input aria-label={`${label} per bed per semester`} type="number" min="1" step="10000" value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})} className="mt-2 min-h-12 w-full rounded-xl border border-border bg-card px-3 text-[16px]" /></label>)}</div><label className="mt-4 block text-sm">Maximum budget range<input aria-label="Maximum semester budget range" type="range" min="100000" max="5000000" step="50000" value={draft.maxPriceUgx||5000000} onChange={e=>setDraft({...draft,maxPriceUgx:e.target.value})} className="mt-2 min-h-11 w-full accent-teal-700" /></label>{budgetError(draft)&&<p role="alert" className="text-sm text-destructive">{budgetError(draft)}</p>}</fieldset>
        <label className="block text-sm font-semibold">Gender arrangement<select aria-label="Gender" value={draft.genderArrangement} onChange={e=>setDraft({...draft,genderArrangement:e.target.value})} className="mt-2 min-h-12 w-full rounded-xl border border-border bg-card px-3"><option value="">Any gender</option>{GENDER_ARRANGEMENTS.map(g=><option key={g} value={g}>{GENDER_ARRANGEMENT_LABELS[g]}</option>)}</select></label>
        <label className="block text-sm font-semibold">Room type<select aria-label="Room type" value={draft.roomCategory} onChange={e=>setDraft({...draft,roomCategory:e.target.value})} className="mt-2 min-h-12 w-full rounded-xl border border-border bg-card px-3"><option value="">Any room type</option>{SELECTABLE_ROOM_CATEGORIES.map(c=><option key={c} value={c}>{roomCategoryLabel(c)}</option>)}</select></label>
        <fieldset><legend className="font-semibold">Bathroom</legend><div className="mt-3 space-y-2">{[['','Any bathroom'],['true','Self-contained'],['false','Shared bathroom']].map(([value,label])=><label key={value} className="flex min-h-11 items-center gap-3"><input type="radio" name="bathroom" value={value} checked={draft.selfContained===value} onChange={()=>setDraft({...draft,selfContained:value})} className="size-5 accent-teal-700" />{label}</label>)}</div></fieldset>
      </div>
    </DialogBody><DialogFooter><Button variant="ghost" onClick={()=>setDraft({...DEFAULT_DISCOVERY,q:applied.q})}>Clear filters</Button><Button disabled={Boolean(budgetError(draft))} onClick={apply}>Apply filters</Button></DialogFooter></Dialog>
  </div>;
}
