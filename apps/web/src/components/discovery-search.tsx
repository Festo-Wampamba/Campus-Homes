"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search, MapPin, Building2 } from "lucide-react";
import { listingSearchResultSchema } from "@campushomes/shared";
import { api } from "@/lib/api";
import { ENABLED_CAMPUSES, UGANDA_BOUNDS } from "@/lib/campuses";
import { cn } from "@/lib/utils";

type Suggestion = { key: string; label: string; detail: string; href: string; hostel?: boolean };
export function DiscoverySearch({ initialQuery = "", hero = false }: { initialQuery?: string; hero?: boolean }) {
  const router = useRouter(); const id = useId();
  const [value, setValue] = useState(initialQuery); const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false); const [active, setActive] = useState(-1);
  useEffect(() => { const timer = setTimeout(() => setQuery(value.trim()), 350); return () => clearTimeout(timer); }, [value]);
  const matches = useQuery({ queryKey: ["discovery-suggestions", query], enabled: query.length >= 2, staleTime: 30_000,
    queryFn: async () => { const params = new URLSearchParams({ ...Object.fromEntries(Object.entries(UGANDA_BOUNDS).map(([k,v]) => [k,String(v)])), university: "MUK", q: query, limit: "6" }); return listingSearchResultSchema.array().parse(await api(`/listings/search?${params}`)); },
  });
  const normalized = value.trim().toLowerCase();
  const suggestions: Suggestion[] = ENABLED_CAMPUSES.flatMap((campus) => [
    { key: campus.code, label: campus.name, detail: "University", href: `/search?campus=${campus.code}` },
    ...campus.areas.map((area) => ({ key: `area-${area.query}`, label: area.name, detail: `Area near ${campus.name}`, href: `/search?campus=${campus.code}&q=${encodeURIComponent(area.query)}` })),
  ]).filter((s) => !normalized || `${s.label} ${s.key}`.toLowerCase().includes(normalized));
  if (query === value.trim()) for (const row of matches.data ?? []) suggestions.push({ key: row.id, label: row.name, detail: row.street_address, href: `/listings/${row.id}`, hostel: true });
  const choices = suggestions.slice(0,8);
  function search() { const campus = ENABLED_CAMPUSES.find(c => [c.code.toLowerCase(), c.name.toLowerCase()].includes(normalized)); router.push(campus ? `/search?campus=${campus.code}` : `/search?campus=MUK${normalized ? `&q=${encodeURIComponent(value.trim())}` : ""}`); setOpen(false); }
  return <div className={cn("relative w-full", hero && "mx-auto max-w-[780px]")}>
    <form role="search" onSubmit={(e) => { e.preventDefault(); if (open && active >= 0 && choices[active]) { router.push(choices[active].href); setOpen(false); } else search(); }} className="flex h-14 rounded-2xl border border-border bg-card text-card-foreground shadow-xs focus-within:ring-2 focus-within:ring-primary">
      <input role="combobox" aria-label="Search university, area or hostel" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-suggestions`} aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined} value={value} onChange={(e) => { setValue(e.target.value); setActive(-1); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); setActive(-1); } if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i+1,choices.length-1)); } if (e.key === "ArrowUp") { e.preventDefault(); setActive(i => Math.max(i-1,0)); } }} placeholder="Search by university, area or hostel…" className="min-w-0 flex-1 rounded-l-2xl bg-transparent px-4 text-[16px] outline-none sm:px-5" />
      <button type="submit" className="flex min-w-14 shrink-0 items-center justify-center gap-2 rounded-r-2xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-teal-700 sm:px-6" aria-label="Search hostels"><span className="hidden sm:inline">Search</span><Search aria-hidden className="size-5" /></button>
    </form>
    {open && <div className="absolute inset-x-0 top-full z-(--z-dropdown) mt-2 max-h-80 overflow-auto rounded-2xl border border-border bg-popover p-2 text-left text-popover-foreground shadow-lg">
      <ul id={`${id}-suggestions`} role="listbox" aria-label="Search suggestions">{choices.map((s,i) => <li key={s.key}><button type="button" role="option" id={`${id}-${i}`} aria-selected={active===i} className={cn("flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-accent", active === i && "bg-accent")} onMouseDown={(e) => e.preventDefault()} onClick={() => { router.push(s.href); setOpen(false); }}>{s.hostel ? <Building2 aria-hidden className="size-5 shrink-0" /> : <MapPin aria-hidden className="size-5 shrink-0" />}<span className="min-w-0"><span className="block text-sm font-semibold">{s.label}</span><span className="block truncate text-xs text-muted-foreground">{s.detail}</span></span></button></li>)}</ul>
      {choices.length===0 && <p className="p-3 text-sm text-muted-foreground">{matches.isFetching ? "Finding hostels…" : "No matching suggestion. Press Search to search this area or name."}</p>}
      {matches.isError && <p className="px-3 pb-2 text-xs text-muted-foreground">Hostel suggestions are unavailable. You can still search.</p>}
    </div>}
  </div>;
}
