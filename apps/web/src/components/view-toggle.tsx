"use client";

import { Grid3x3, List, Rows3, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type ViewMode = "grid" | "rows" | "list";

const VIEW_OPTIONS: Array<{ value: ViewMode; label: string; icon: LucideIcon }> = [
  { value: "grid", label: "Grid", icon: Grid3x3 },
  { value: "rows", label: "Rows", icon: Rows3 },
  { value: "list", label: "List", icon: List },
];

/** Segmented Grid/Rows/List switcher — same structure as a standard
 * segmented control (bordered pill, active = solid fill) but built on this
 * project's semantic tokens rather than one-off hex values, so it themes
 * correctly in dark mode along with everything else. */
export function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (view: ViewMode) => void }) {
  return (
    <div className="flex w-full items-center rounded-lg border border-border bg-card p-1 sm:w-auto">
      {VIEW_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={view === option.value}
          aria-label={option.label}
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors sm:flex-none",
            view === option.value
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <option.icon aria-hidden className="size-4" />
          <span className="sm:hidden">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
