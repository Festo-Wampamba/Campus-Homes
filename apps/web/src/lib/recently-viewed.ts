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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Storage is user-controlled: anything else could write here. Only well-formed
// entries leave this module, so an `id` can't smuggle a path into the
// credentialed `/listings/${id}` request or a link.
function isEntry(value: unknown): value is RecentlyViewedEntry {
  const e = value as Partial<RecentlyViewedEntry> | null;
  return typeof e === "object" && e !== null
    && typeof e.id === "string" && UUID.test(e.id)
    && typeof e.name === "string" && typeof e.streetAddress === "string"
    && (e.photoStorageKey === null || typeof e.photoStorageKey === "string")
    && typeof e.priceUgx === "number" && typeof e.viewedAt === "number";
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
    cachedEntries = Array.isArray(parsed) ? parsed.filter(isEntry) : [];
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
