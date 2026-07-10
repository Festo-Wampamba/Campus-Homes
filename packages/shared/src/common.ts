import { z } from 'zod';

export const uuid = z.uuid();

// Ugandan mobile numbers in E.164: +2567XXXXXXXX (MTN/Airtel mobile-money range).
export const ugPhone = z
  .string()
  .regex(/^\+2567\d{8}$/, 'Phone must be a Ugandan mobile number in +2567XXXXXXXX format');

// All money is integer UGX — no decimals, no floats, ever.
export const ugxAmount = z.number().int().positive();

// Client-generated idempotency keys (offline sync, hold creation, webhook dedup).
export const idempotencyKey = z.string().min(16).max(128);
