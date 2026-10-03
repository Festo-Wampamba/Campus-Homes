"use client";

import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CAMPUS_LOCATIONS } from "@/lib/campuses";
import { cn } from "@/lib/utils";

const POPULAR_CAMPUSES = Object.values(CAMPUS_LOCATIONS);

function matchCampus(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;

  return (
    POPULAR_CAMPUSES.find(
      (campus) =>
        campus.code.toLowerCase() === normalized ||
        campus.name.toLowerCase().includes(normalized),
    ) ?? null
  );
}

export function HomeSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function search(query: string) {
    const campus = matchCampus(query);
    if (campus) {
      router.push(`/search?campus=${campus.code}`);
      return;
    }

    router.push(query.trim() ? `/search?q=${encodeURIComponent(query.trim())}` : "/search");
  }

  return (
    <div className="mt-8 w-full max-w-[42rem]">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          search(value);
        }}
        className="flex rounded-xl border border-white/60 bg-white p-1.5 shadow-[0_12px_30px_-16px_rgba(3,33,33,0.45)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-white"
      >
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search by hostel name or university</span>
          <MagnifyingGlassIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-teal-700"
          />
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Search university, area or hostel"
            // The pill behind this input is a hardcoded bg-white (for contrast
            // against the hero photo in both light and dark theme), so the
            // text/placeholder colors must stay hardcoded dark too — the
            // theme-reactive `text-foreground` token turns near-white in dark
            // mode, which made typed text invisible on the white pill.
            className="h-12 w-full rounded-lg bg-transparent pr-3 pl-12 text-sm font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-500 focus:outline-none sm:h-14 sm:text-base"
          />
        </label>
        <button
          type="submit"
          data-cta="hero-search"
          className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-coral-500 px-4 text-sm font-bold text-teal-900 transition-colors hover:bg-coral-600 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-900 active:scale-[0.98] sm:h-14 sm:px-7"
        >
          <MagnifyingGlassIcon aria-hidden className="size-4" />
          <span className="hidden sm:inline">Search hostels</span>
          <span className="sm:hidden">Search</span>
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Popular universities">
        <span className="mr-1 text-sm font-semibold text-white/80">Popular near</span>
        {POPULAR_CAMPUSES.map((campus) => (
          <button
            key={campus.code}
            type="button"
            onClick={() => router.push(`/search?campus=${campus.code}`)}
            className={cn(
              "rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur-sm",
              "transition-colors hover:border-white/60 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.98]",
            )}
          >
            {campus.code}
          </button>
        ))}
      </div>
    </div>
  );
}
