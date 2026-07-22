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

// Client-generated idempotency keys (offline sync, hold creation, webhook dedup).
export const idempotencyKey = z.string().min(16).max(128);
