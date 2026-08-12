import { z } from 'zod';

import { PAYMENT_STATUSES, RESERVATION_STATUSES } from './enums.js';
import { idempotencyKey, ugxAmount, uuid } from './common.js';

// The fixed reservation fee. Not configurable — pricing changes are a product
// decision, not an API parameter a client may set.
export const RESERVATION_FEE_UGX = 5000;

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
