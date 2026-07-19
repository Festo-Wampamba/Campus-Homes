// Recently-viewed listings — tracked entirely client-side (localStorage), no
// backend needed. It's tied to the browser, not the account, so it works the
// same whether you're signed in or not.
const STORAGE_KEY = "campushomes:recently-viewed";
const MAX_ENTRIES = 10;

export interface RecentlyViewedEntry {
  id: string;
  name: string;
  streetAddress: string;
  photoStorageKey: string | null;
  priceUgx: number;
  viewedAt: number;
}

// Cached by raw string so repeated calls return the same array reference
// when nothing changed — required for useSyncExternalStore (its getSnapshot
// must be stable, or React treats every call as "the store changed" and
// re-renders in a loop).
let cachedRaw: string | null = null;
let cachedEntries: RecentlyViewedEntry[] = [];

export function getRecentlyViewed(): RecentlyViewedEntry[] {
  if (typeof window === "undefined") return cachedEntries;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return cachedEntries;
  }
  if (raw === cachedRaw) return cachedEntries;
  cachedRaw = raw;
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    cachedEntries = Array.isArray(parsed) ? (parsed as RecentlyViewedEntry[]) : [];
  } catch {
    cachedEntries = [];
  }
  return cachedEntries;
}

export function addRecentlyViewed(entry: Omit<RecentlyViewedEntry, "viewedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getRecentlyViewed().filter((e) => e.id !== entry.id);
    const next = [{ ...entry, viewedAt: Date.now() }, ...existing].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or unavailable (private browsing) — not worth surfacing.
  }
}

export function clearRecentlyViewed(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
