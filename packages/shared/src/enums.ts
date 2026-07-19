// Single source of truth for every enum in the system.
// Drizzle pgEnum definitions and Zod schemas both derive from these arrays,
// so a value can never exist in the DB without existing in validation, or vice versa.

export const USER_ROLES = ['student', 'landlord', 'ops_inspector', 'ops_lead', 'admin'] as const;
export const USER_STATUSES = ['active', 'suspended', 'pending'] as const;

export const UNIVERSITIES = ['MUK', 'MUBS', 'KIU', 'KYU', 'other'] as const;
export const OPS_TEAMS = ['inspector', 'lead'] as const;
export const CATCHMENTS = ['MUK', 'MUBS', 'KIU', 'KYU', 'all'] as const;

export const KYC_STATUSES = ['pending', 'verified', 'rejected'] as const;
export const TOKEN_TYPES = ['phone_otp', 'step_up_otp'] as const;

export const PROPERTY_TYPES = ['hostel'] as const;
export const PROPERTY_STATUSES = ['pending_kyc', 'active', 'suspended'] as const;
export const DOC_TYPES = ['title_deed', 'tenancy', 'authorization', 'other'] as const;

// A listing's inventory is priced per room type, not as one flat price — a
// hostel can offer several categories at once (e.g. 30 singles at one price,
// 40 doubles at another), each backed by any number of individual units.
export const ROOM_CATEGORIES = ['single', 'double', 'triple', 'quad', 'other'] as const;

export const VISIT_RESULTS = ['pending', 'passed', 'failed'] as const;
export const LISTING_STATUSES = [
  'draft',
  'pending_verification',
  'verified',
  'expired',
  'suspended',
] as const;

export const RESERVATION_STATUSES = [
  'held',
  'payment_pending',
  'payment_failed',
  'fulfilled',
  'cancelled',
  'refunded',
  'expired',
] as const;
export const PAYMENT_PROVIDERS = ['flutterwave'] as const;
export const PAYMENT_METHODS = ['mtn_momo', 'airtel_money', 'card', 'bank_transfer'] as const;
export const PAYMENT_STATUSES = ['pending', 'succeeded', 'failed', 'cancelled'] as const;
export const REFUND_REASONS = [
  'cooling_off',
  'landlord_failure',
  'ops_dispute',
  'student_cancel',
] as const;
export const REFUND_STATUSES = ['pending', 'processed', 'failed'] as const;
export const MOVE_IN_CONFIRMER_ROLES = ['student', 'landlord', 'ops'] as const;

export const STRIKE_REASONS = [
  'no_show',
  'price_mismatch',
  'amenity_fraud',
  'abusive',
  'other',
] as const;
export const STUDENT_FLAG_REASONS = ['no_show', 'abusive_chat', 'false_review', 'other'] as const;
export const REPUTATION_SUBJECT_TYPES = ['property', 'landlord'] as const;

export const NOTIFICATION_CHANNELS = ['sms', 'push', 'in_app'] as const;
export const NOTIFICATION_STATUSES = ['pending', 'sent', 'delivered', 'failed'] as const;

// The 6 components every verification visit must confirm before a listing
// can reach status = verified (enforced by a DB trigger, not just app logic).
export const VERIFICATION_CHECKLIST_COMPONENTS = [
  'location_gps',
  'rooms_capacity',
  'amenities',
  'photos',
  'landlord_identity',
  'safety',
] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type UserStatus = (typeof USER_STATUSES)[number];
export type University = (typeof UNIVERSITIES)[number];
export type KycStatus = (typeof KYC_STATUSES)[number];
export type PropertyType = (typeof PROPERTY_TYPES)[number];
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];
export type DocType = (typeof DOC_TYPES)[number];
export type RoomCategory = (typeof ROOM_CATEGORIES)[number];
export type ListingStatus = (typeof LISTING_STATUSES)[number];
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type VerificationChecklistComponent = (typeof VERIFICATION_CHECKLIST_COMPONENTS)[number];
export type VisitResult = (typeof VISIT_RESULTS)[number];
export type StrikeReason = (typeof STRIKE_REASONS)[number];
