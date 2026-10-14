import { z } from 'zod';

export const uuid = z.uuid();

// Accept familiar local/display formats at input boundaries, but always expose
// one canonical E.164 value to services and the database.
export function normalizeUgPhone(value: string): string {
  const compact = value.trim().replace(/[\s().-]/g, '');
  if (/^07\d{8}$/.test(compact)) return `+256${compact.slice(1)}`;
  if (/^2567\d{8}$/.test(compact)) return `+${compact}`;
  return compact;
}

// Ugandan mobile numbers in E.164: +2567XXXXXXXX (MTN/Airtel mobile-money range).
export const ugPhone = z.preprocess(
  (value) => typeof value === 'string' ? normalizeUgPhone(value) : value,
  z.string().regex(/^\+2567\d{8}$/, 'Enter a Ugandan mobile number such as +256 771 234 567'),
);

// All money is integer UGX — no decimals, no floats, ever.
export const ugxAmount = z.number().int().positive();

// Rent floor for every rent Ops, an admin or a landlord's room type sets
// (decided 2026-10-14). It catches typos like UGX 2. Input schemas only:
// response schemas must still parse older rows below it.
export const MIN_PRICE_PER_TERM_UGX = 50_000;
export const rentPerTermUgx = ugxAmount.min(
  MIN_PRICE_PER_TERM_UGX,
  `Rent must be at least UGX ${MIN_PRICE_PER_TERM_UGX.toLocaleString('en-US')} per semester`,
);

// Client-generated idempotency keys (offline sync, hold creation, webhook dedup).
export const idempotencyKey = z.string().min(16).max(128);

// A place is fully furnished, partly furnished or unfurnished, never two of
// them (Kasubi Horizon showed both "Unfurnished" and "Fully furnished").
export const FURNISHING_LEVELS = ['fully_furnished', 'partly_furnished', 'unfurnished'] as const;

/** Ticks or unticks one checklist key; ticking a furnishing level unticks the
 * other two, so every checklist form behaves like a radio group for them. */
export function withAmenity(current: Record<string, boolean>, key: string, checked: boolean): Record<string, boolean> {
  const next = { ...current, [key]: checked };
  if (checked && (FURNISHING_LEVELS as readonly string[]).includes(key)) {
    for (const level of FURNISHING_LEVELS) if (level !== key) next[level] = false;
  }
  return next;
}

// Input checklists only; stored rows may still hold two levels until fixed.
export const amenityChecklist = z
  .record(z.string(), z.boolean())
  .refine((items) => FURNISHING_LEVELS.filter((level) => items[level]).length <= 1, {
    message: 'Choose one of Fully furnished, Partly furnished or Unfurnished',
  });
