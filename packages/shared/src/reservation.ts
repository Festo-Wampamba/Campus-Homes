import { z } from 'zod';

import { PAYMENT_STATUSES, RESERVATION_STATUSES } from './enums.js';
import { idempotencyKey, ugxAmount, uuid } from './common.js';

// The reservation fee. Not client-settable — pricing changes are a product
// decision made via platform_settings.reservation_fee_ugx (admin console),
// never an API parameter. Zero for now, deliberately: charging a real fee
// before the platform has real traffic just adds friction to reserving, and
// there's no live payment gateway wired yet anyway. reservations.service.ts
// skips the whole checkout step whenever the effective fee is 0 — a
// reservation is created straight as 'fulfilled', no hold/payment/webhook
// involved. Restore a nonzero value here (or set the platform_settings
// override) once the site has enough traffic to justify collecting it.
export const RESERVATION_FEE_UGX = 0;

export const createHoldSchema = z.object({
  unitId: uuid,
  // Generated client-side so a retried request can never create two holds.
  idempotencyKey,
});
export type CreateHoldInput = z.infer<typeof createHoldSchema>;

export const reservationSchema = z.object({
  id: uuid,
  studentId: uuid,
  unitId: uuid,
  listingVersionId: uuid,
  status: z.enum(RESERVATION_STATUSES),
  feeAmountUgx: ugxAmount,
  holdExpiresAt: z.iso.datetime().nullable(),
});
export type Reservation = z.infer<typeof reservationSchema>;

// What a landlord may see about a reservation on their unit: status +
// creation time, never payment detail (enforced by RLS column scoping on
// the API response). createdAt powers the landlord analytics bookings-trend
// chart; moveInConfirmedAt lets the bookings list show a real "Moved in"
// state instead of an always-clickable action that's a no-op most of the
// time — both are real columns already on rows the landlord can see, not a
// new data exposure.
export const landlordReservationViewSchema = reservationSchema.pick({
  id: true,
  unitId: true,
  status: true,
  holdExpiresAt: true,
}).extend({
  createdAt: z.iso.datetime(),
  moveInConfirmedAt: z.iso.datetime().nullable(),
});
export type LandlordReservationView = z.infer<typeof landlordReservationViewSchema>;

export const paymentStatusSchema = z.object({
  reservationId: uuid,
  status: z.enum(PAYMENT_STATUSES),
});
export type PaymentStatusView = z.infer<typeof paymentStatusSchema>;
