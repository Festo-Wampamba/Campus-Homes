"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

import { CAMPUS_LOCATIONS } from "@/lib/campuses";
import { cn } from "@/lib/utils";

const POPULAR_CAMPUSES = Object.values(CAMPUS_LOCATIONS);

// Matches free text against a known campus (by name or code) so typing
// "Makerere" routes straight to that campus's pre-centered map, the same
// destination the "Browse by university" tiles below use — otherwise it
// falls back to a plain hostel-name search.
function matchCampus(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return (
    POPULAR_CAMPUSES.find(
      (c) => c.code.toLowerCase() === q || c.name.toLowerCase().includes(q),
    ) ?? null
  );
}

export function HomeSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function go(query: string) {
    const campus = matchCampus(query);
    if (campus) {
      router.push(`/search?campus=${campus.code}`);
    } else if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    } else {
      router.push("/search");
    }
  }

  return (
    <div className="mt-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(value);
        }}
        className="flex overflow-hidden rounded-md bg-white shadow-md"
      >
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Search by hostel name or university…"
            aria-label="Search by hostel name or university"
            className="h-12 w-full bg-transparent pr-3 pl-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none sm:h-12 sm:text-base"
          />
        </div>
        <button
          type="submit"
          className="inline-flex h-12 shrink-0 items-center gap-1.5 bg-coral-500 px-5 font-semibold text-teal-900 transition-colors duration-150 hover:bg-coral-600 hover:text-white"
        >
          <Search aria-hidden className="size-4" strokeWidth={2.5} />
          <span className="hidden sm:inline">Search</span>
        </button>
      </form>

      {POPULAR_CAMPUSES.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-white/70">Popular:</span>
          {POPULAR_CAMPUSES.map((campus) => (
            <button
              key={campus.code}
              type="button"
              onClick={() => router.push(`/search?campus=${campus.code}`)}
              className={cn(
                "rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/90",
                "transition-colors duration-150 hover:bg-white/20",
              )}
            >
              {campus.code}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
