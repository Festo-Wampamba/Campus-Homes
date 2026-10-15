"use client";

import { useState } from "react";
import {
  BedDouble,
  BookOpen,
  Building2,
  CalendarCheck,
  FileQuestion,
  KeyRound,
  LayoutDashboard,
  MessageCircle,
  Printer,
  Search,
  ShieldCheck,
  User,
  type LucideIcon,
} from "lucide-react";

import { SUPPORT_MANUAL, type SupportManualSectionId } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ICONS: Record<SupportManualSectionId, LucideIcon> = {
  "getting-started": BookOpen,
  "finding-a-room": Search,
  "listing-page": BedDouble,
  reserving: CalendarCheck,
  booking: KeyRound,
  dashboard: LayoutDashboard,
  messages: MessageCircle,
  profile: User,
  landlords: Building2,
  safety: ShieldCheck,
  troubleshooting: FileQuestion,
};

export function UserManual() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  // A title match keeps the whole section; otherwise only the matching steps.
  const sections = q
    ? SUPPORT_MANUAL.map((section) => ({
        ...section,
        steps: section.title.toLowerCase().includes(q)
          ? section.steps
          : section.steps.filter((step) => step.toLowerCase().includes(q)),
      })).filter((section) => section.steps.length > 0)
    : SUPPORT_MANUAL;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row print:hidden">
        <label className="relative flex-1">
          <span className="sr-only">Search the manual</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search the manual…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </label>
        <Button type="button" variant="secondary" onClick={() => window.print()}>
          <Printer aria-hidden />
          Print / Save PDF
        </Button>
      </div>

      {!q && (
        <nav aria-label="Manual contents" className="rounded-xl border border-border bg-card p-5 print:hidden">
          <p className="font-display font-semibold">Contents</p>
          <ul className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {SUPPORT_MANUAL.map((section) => {
              const Icon = ICONS[section.id];
              return (
                <li key={section.id}>
                  <a
                    href={`#manual-${section.id}`}
                    className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-muted"
                  >
                    <Icon aria-hidden className="size-4 shrink-0 text-teal-700 dark:text-teal-300" />
                    {section.title}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {sections.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nothing in the manual matches &ldquo;{query.trim()}&rdquo;. Try another word, or ask CampusHomes AI.
        </p>
      ) : (
        sections.map((section) => {
          const Icon = ICONS[section.id];
          return (
            <section
              key={section.id}
              id={`manual-${section.id}`}
              aria-labelledby={`manual-${section.id}-title`}
              className="scroll-mt-24 rounded-xl border border-border bg-card p-5 sm:p-6 print:break-inside-avoid print:border-0 print:p-0"
            >
              <h2 id={`manual-${section.id}-title`} className="flex items-center gap-2.5 text-lg">
                <Icon aria-hidden className="size-5 text-teal-700 dark:text-teal-300" />
                {section.title}
              </h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground marker:text-teal-700">
                {section.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>
          );
        })
      )}
    </div>
  );
}
