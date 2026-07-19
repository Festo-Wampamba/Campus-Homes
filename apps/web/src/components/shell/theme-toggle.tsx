"use client";

import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

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

export function ThemeToggle() {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={toggleTheme}
    >
      <Sun aria-hidden className="size-4 dark:hidden" />
      <Moon aria-hidden className="hidden size-4 dark:block" />
    </Button>
  );
}
