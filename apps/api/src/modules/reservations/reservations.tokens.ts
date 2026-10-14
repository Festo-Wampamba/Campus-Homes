// Dormant since the bed-level redesign (2026-09) — nothing in ReservationsService
// injects this anymore (booking is landlord-confirmed, not payment-gated), kept
// registered in reservations.module.ts for Phase 2 real-money work.
export const PAYMENTS = 'PAYMENTS_ADAPTER';
export const RESERVATION_EXPIRY_QUEUE = 'RESERVATION_EXPIRY_QUEUE';
export const RESERVATION_EXPIRY_QUEUE_NAME = 'reservation_expiry';

// Every hold past its reserved_expires_at becomes 'expired'. The per-reservation
// delayed job normally does this; this sweep backs it up, so a job lost to a
// Redis restart can never keep a bed held, counted against the student's
// limit, or blocked by the live-reservation unique index.
export const EXPIRE_OVERDUE_HOLDS_SQL = `UPDATE reservations SET status = 'expired', updated_at = now()
  WHERE status = 'reserved' AND reserved_expires_at <= now()`;
