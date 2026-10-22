"use client";

import { Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";

const STORAGE_KEY = "theme";

// No React state: which icon shows is resolved purely by CSS (`dark:hidden`/
// `dark:block`) against the *current* DOM class, so server and client always
// render identical JSX/attributes — no hydration mismatch, no effect needed
// to "sync" state from `document` (which doesn't exist during SSR anyway).
function toggleTheme() {
  const next = !document.documentElement.classList.contains("dark");
  document.documentElement.classList.toggle("dark", next);
  localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
}

export function ThemeToggle({ className }: { className?: string }) {
  return (
    <button
      type="button"
      aria-label="Toggle theme"
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-current transition-opacity duration-150 hover:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
      onClick={toggleTheme}
    >
      <Sun aria-hidden className="size-4 dark:hidden" />
      <Moon aria-hidden className="hidden size-4 dark:block" />
    </button>
  );
}
