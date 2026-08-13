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
    <div className="mx-auto mt-7 w-full max-w-2xl">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          search(value);
        }}
        className="group flex rounded-xl bg-white p-1.5 shadow-[0_24px_70px_-24px_rgba(3,33,33,0.48)] ring-1 ring-white/70 transition duration-300 focus-within:-translate-y-0.5 focus-within:shadow-[0_28px_80px_-24px_rgba(3,33,33,0.58)]"
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
            className="h-12 w-full rounded-lg bg-transparent pr-3 pl-12 text-sm font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:outline-none sm:h-14 sm:text-base"
          />
        </label>
        <button
          type="submit"
          className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-coral-500 px-4 text-sm font-bold text-teal-900 transition duration-300 hover:bg-coral-600 hover:text-white active:scale-[0.98] sm:h-14 sm:px-7"
        >
          <MagnifyingGlassIcon aria-hidden className="size-4" />
          <span className="hidden sm:inline">Find a room</span>
          <span className="sm:hidden">Search</span>
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2" aria-label="Popular universities">
        <span className="mr-1 text-xs font-semibold text-white/65">Popular near</span>
        {POPULAR_CAMPUSES.map((campus) => (
          <button
            key={campus.code}
            type="button"
            onClick={() => router.push(`/search?campus=${campus.code}`)}
            className={cn(
              "rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/90 backdrop-blur-sm",
              "transition duration-300 hover:-translate-y-0.5 hover:border-white/35 hover:bg-white/20 active:scale-[0.98]",
            )}
          >
            {campus.code}
          </button>
        ))}
      </div>
    </div>
  );
}
