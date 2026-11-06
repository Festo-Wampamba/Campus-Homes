import { z } from 'zod';

import { PAYMENT_METHODS, RESERVATION_STATUSES, UNIVERSITIES } from './enums.js';
import { idempotencyKey, normalizeUgPhone, ugPhone, ugxAmount, uuid } from './common.js';

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

// Landlord/custodian confirms a booking against a student's own Reserved row.
// Booking an existing account by phone alone is gone (2026-10-30): anyone who
// knew a student's number could attach them to a bed and read their contact
// details. A student who already has an account reserves the bed themselves
// and the landlord confirms it here; walk-ins without an account go through
// onboardWalkInSchema.
export const bookReservationSchema = z.object({
  reservationId: uuid,
  bookingFeeCollectedUgx: ugxAmount.optional(),
  depositCollectedUgx: ugxAmount.optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  notes: z.string().trim().max(500).optional(),
});
export type BookReservationInput = z.infer<typeof bookReservationSchema>;

// A student who walked in without CampusHomes (Festo, 2026-10-23): the landlord
// creates their account and books them a free bed in one step. A phone that
// already has an account is refused here: use a tenant-assignment request instead.
// The student later signs in with this phone or email to claim it.
// Email is optional and must not belong to another account: SMS codes don't
// reach students yet (Festo, 2026-10-23), so email is how most will sign in.
// Like the phone, whoever controls the address can claim the account.
export const onboardWalkInSchema = z.object({
  bedId: uuid,
  semesterId: uuid.optional(),
  idempotencyKey: idempotencyKey.optional(),
  name: z.string().trim().min(2).max(120),
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  gender: z.enum(['male', 'female']).optional(),
  phone: ugPhone,
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  university: z.enum(UNIVERSITIES),
  movedIn: z.boolean().default(false),
  bookingFeeCollectedUgx: ugxAmount.optional(),
  depositCollectedUgx: ugxAmount.optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
});
export type OnboardWalkInInput = z.infer<typeof onboardWalkInSchema>;

// Private property records book immediately without creating/claiming a login.
// Supplied contacts are bookkeeping data, never authentication identifiers.
export const tenantRecordSchema = onboardWalkInSchema.extend({
  kind: z.literal('record'), idempotencyKey, phone: ugPhone.optional(),
});

// Existing accounts accept the assignment themselves; the landlord never receives
// account lookup results or overwrites identity data. Each batch row is retry-safe.
export const tenantIntakeEntrySchema = z.discriminatedUnion('kind', [
  tenantRecordSchema,
  onboardWalkInSchema.extend({ kind: z.literal('new'), idempotencyKey }),
  z.object({
    kind: z.literal('existing'), bedId: uuid, semesterId: uuid.optional(), idempotencyKey,
    contact: z.string().trim().min(5).max(254).transform((value) => value.includes('@') ? value.toLowerCase() : normalizeUgPhone(value))
      .refine((value) => z.string().email().safeParse(value).success || ugPhone.safeParse(value).success,
        'Enter their verified email or phone number'),
    movedIn: z.boolean().default(false),
    bookingFeeCollectedUgx: ugxAmount.optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  }),
]);
export const tenantIntakeSchema = z.object({ entries: z.array(tenantIntakeEntrySchema).min(1).max(50) })
  .superRefine(({ entries }, ctx) => {
    if (new Set(entries.map((entry) => entry.bedId)).size !== entries.length) {
      ctx.addIssue({ code: 'custom', path: ['entries'], message: 'Choose a different bed for each student' });
    }
    if (new Set(entries.map((entry) => entry.idempotencyKey)).size !== entries.length) {
      ctx.addIssue({ code: 'custom', path: ['entries'], message: 'Each student needs a distinct request key' });
    }
  });
export type TenantIntakeInput = z.infer<typeof tenantIntakeSchema>;
export type TenantIntakeResult = { key: string; status: 'added' | 'requested' | 'failed'; reservationId?: string; bookingStatus?: 'booked' | 'occupied'; message?: string };
export type TenantAssignmentRequest = {
  id: string; propertyName: string; roomLabel: string; bedLabel: string;
  pricePerTermUgx: number; movedIn: boolean; amountPaidUgx: number; expiresAt: string;
};

export type ImportedTenantRow = {
  rowNumber: number; firstName: string; lastName: string; gender: 'male' | 'female' | '';
  kind: 'record' | 'new' | 'existing'; phone: string; email: string; university: string;
  propertyName: string; roomLabel: string; bedLabel: string; amountPaid: string;
  rent: string; balance: string; paymentMethod: string; movedIn: boolean; warnings: string[];
};

// A booking fee / deposit a landlord recorded (0075). Both parties get a copy.
export const paymentReceiptSchema = z.object({
  id: uuid,
  receiptNumber: z.string(),
  reservationId: uuid,
  propertyName: z.string(),
  roomLabel: z.string(),
  studentName: z.string().nullable(),
  bookingFeeUgx: z.number().int().nonnegative(),
  depositUgx: z.number().int().nonnegative(),
  rentUgx: z.number().int().nonnegative().default(0),
  totalUgx: z.number().int().nonnegative(),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
  recordedAt: z.string(),
});
export type PaymentReceipt = z.infer<typeof paymentReceiptSchema>;

// A later payment on a live booking (0078): one receipt per instalment.
export const recordPaymentSchema = z.object({
  amountUgx: ugxAmount,
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  // One per payment, made in the browser: a retry with the same key returns
  // the first receipt instead of recording the money twice.
  idempotencyKey,
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

// One booked or moved-in student on the landlord's Tenants page. Total is the
// rent stored when they booked; Paid adds up every receipt for the booking.
export const landlordTenantSchema = z.object({
  reservationId: uuid,
  bedId: uuid,
  status: z.enum(['booked', 'occupied']),
  propertyId: uuid,
  propertyName: z.string(),
  unitId: uuid,
  roomLabel: z.string(),
  bedLabel: z.string(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactPhone: z.string().nullable(),
  totalUgx: z.coerce.number().int().nonnegative(),
  paidUgx: z.coerce.number().int().nonnegative(),
  balanceUgx: z.coerce.number().int(),
});
export type LandlordTenant = z.infer<typeof landlordTenantSchema>;

// What the landlord of a booked bed may see about the student. Never any
// credential: passwords live in Logto and are reset by the student or a super admin.
export const reservationStudentSchema = z.object({
  name: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  university: z.string().nullable(),
  yearOfStudy: z.number().int().nullable(),
  gender: z.string().nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactPhone: z.string().nullable(),
  hasSignedIn: z.boolean(),
});
export type ReservationStudent = z.infer<typeof reservationStudentSchema>;

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

// Live ('reserved' or 'booked') reservations one student may hold at once.
// The API enforces it; the web states it next to the Reserve buttons.
export const MAX_ACTIVE_RESERVATIONS = 5;

// What a student sees about their own reservation — the bare row plus
// enough context to tell one reservation apart from another (property name,
// room type, rent, which bed) without a second round trip. `mine()` joins
// this in server-side; nothing here is client-editable.
export const studentReservationViewSchema = reservationSchema.extend({
  listingId: uuid,
  publicListing: z.boolean().optional(),
  propertyName: z.string(),
  propertyStreetAddress: z.string(),
  bedLabel: z.string(),
  roomCategory: z.string(),
  roomCapacity: z.number().int(),
  rentPerTermUgx: ugxAmount,
  depositUgx: ugxAmount.nullable(),
  // Optional so a web build that ships before its API still parses the list.
  reservedAt: z.iso.datetime().nullable().optional(),
  // Set once the student asked the landlord to confirm the booking.
  bookingRequestedAt: z.iso.datetime().nullable().optional(),
  // Booking tracker: when the move-in was confirmed, and when the status last
  // changed (the date a cancelled, expired or released reservation ended).
  moveInConfirmedAt: z.iso.datetime().nullable().optional(),
  updatedAt: z.iso.datetime().nullable().optional(),
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
    // Set once the student asked to book; the landlord confirms it from there.
    bookingRequestedAt: z.iso.datetime().nullable().optional(),
  });
export type LandlordReservationView = z.infer<typeof landlordReservationViewSchema>;
