// Dormant since the bed-level redesign (2026-09) — nothing in ReservationsService
// injects this anymore (booking is landlord-confirmed, not payment-gated), kept
// registered in reservations.module.ts for Phase 2 real-money work.
export const PAYMENTS = 'PAYMENTS_ADAPTER';
export const RESERVATION_EXPIRY_QUEUE = 'RESERVATION_EXPIRY_QUEUE';
export const RESERVATION_EXPIRY_QUEUE_NAME = 'reservation_expiry';
