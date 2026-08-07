// Collapsed/expanded preference for AppShell's persistent sidebar — one
// shared key so the preference is consistent across every portal. Booleans
// are primitives, so no referential-stability caching is needed the way
// recently-viewed.ts needs for its array snapshot.
const STORAGE_KEY = "campushomes:sidebar-collapsed";
const listeners = new Set<() => void>();

export function getSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function getSidebarCollapsedServerSnapshot(): boolean {
  return false;
}

export function setSidebarCollapsed(next: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // Storage full or unavailable (private browsing) — not worth surfacing.
  }
  for (const listener of listeners) listener();
}

export function subscribeSidebarCollapsed(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
