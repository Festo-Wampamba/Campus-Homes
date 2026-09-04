import { z } from 'zod';

import { PAYMENT_METHODS, RESERVATION_STATUSES } from './enums.js';
import { idempotencyKey, ugPhone, ugxAmount, uuid } from './common.js';

// Reserve -> Book -> Move-in (bed-level redesign, 2026-09). Booking payment
// is expected to happen offline — the landlord/custodian records what they
// collected via `book`, it never gates Reserved -> Booked the way an online
// payment webhook used to gate Held -> Fulfilled. There is no more
// platform-wide reservation fee (RESERVATION_FEE_UGX is gone); whatever a
// landlord charges to book is their own business, tracked per-reservation.

export const reserveSchema = z.object({
  bedId: uuid,
  // Rooms are permanent/property-level (2026-09) — a single unit can carry
  // pricing for more than one semester, so `bedId` alone no longer pins down
  // which listing/semester/price the student actually saw and agreed to.
  // This is the listing the student was viewing when they clicked Reserve.
  listingId: uuid,
  // Generated client-side so a retried request can never create two holds.
  idempotencyKey,
});
export type ReserveInput = z.infer<typeof reserveSchema>;

// Landlord/custodian confirms a booking two ways: against an existing
// Reserved row (`reservationId`), or directly against an Available bed with
// no prior Reserve step at all (`bedId` + `studentPhone`) — the walk-in
// path. Exactly one of the two shapes must be provided.
export const bookReservationSchema = z
  .object({
    reservationId: uuid.optional(),
    bedId: uuid.optional(),
    // Walk-in only: how the landlord identifies which student account this
    // booking belongs to. The student must already have an account (and a
    // completed profile) — this doesn't create one.
    studentPhone: ugPhone.optional(),
    bookingFeeCollectedUgx: ugxAmount.optional(),
    depositCollectedUgx: ugxAmount.optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((v) => Boolean(v.reservationId) !== Boolean(v.bedId), {
    message: 'Provide either reservationId (booking an existing reservation) or bedId (booking a walk-in directly), not both',
    path: ['reservationId'],
  })
  .refine((v) => !v.bedId || Boolean(v.studentPhone), {
    message: 'studentPhone is required when booking a bed directly',
    path: ['studentPhone'],
  });
export type BookReservationInput = z.infer<typeof bookReservationSchema>;

// Landlord/custodian/ops freeing up a Reserved or Booked bed the student
// didn't end up taking. Always requires a reason — money may already have
// changed hands offline for a Booked bed.
export const releaseReservationSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  refundRequired: z.boolean().default(false),
  notes: z.string().trim().max(500).optional(),
});
export type ReleaseReservationInput = z.infer<typeof releaseReservationSchema>;

export const reservationSchema = z.object({
  id: uuid,
  studentId: uuid,
  bedId: uuid,
  listingVersionId: uuid,
  status: z.enum(RESERVATION_STATUSES),
  // Only set while status === 'reserved' — cleared once Booked (a booked
  // bed never auto-expires).
  reservedExpiresAt: z.iso.datetime().nullable(),
  bookedAt: z.iso.datetime().nullable(),
  bookingFeeCollectedUgx: ugxAmount.nullable(),
  depositCollectedUgx: ugxAmount.nullable(),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
});
export type Reservation = z.infer<typeof reservationSchema>;

// What a student sees about their own reservation — the bare row plus
// enough context to tell one reservation apart from another (property name,
// room type, rent, which bed) without a second round trip. `mine()` joins
// this in server-side; nothing here is client-editable.
export const studentReservationViewSchema = reservationSchema.extend({
  listingId: uuid,
  propertyName: z.string(),
  propertyStreetAddress: z.string(),
  bedLabel: z.string(),
  roomCategory: z.string(),
  roomCapacity: z.number().int(),
  rentPerTermUgx: ugxAmount,
  depositUgx: ugxAmount.nullable(),
});
export type StudentReservationView = z.infer<typeof studentReservationViewSchema>;

// What a landlord may see about a reservation on their own bed — status,
// booking/payment info they themselves recorded, and move-in confirmation.
// Never another landlord's data (RLS-scoped); never platform-internal detail.
export const landlordReservationViewSchema = reservationSchema
  .pick({
    id: true,
    bedId: true,
    status: true,
    reservedExpiresAt: true,
    bookedAt: true,
    bookingFeeCollectedUgx: true,
    depositCollectedUgx: true,
    paymentMethod: true,
  })
  .extend({
    createdAt: z.iso.datetime(),
    bedLabel: z.string(),
    moveInConfirmedAt: z.iso.datetime().nullable(),
  });
export type LandlordReservationView = z.infer<typeof landlordReservationViewSchema>;
