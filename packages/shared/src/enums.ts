// Single source of truth for every enum in the system.
// Drizzle pgEnum definitions and Zod schemas both derive from these arrays,
// so a value can never exist in the DB without existing in validation, or vice versa.

export const USER_ROLES = [
  'student',
  'landlord',
  'custodian',
  'property_worker',
  'ops_inspector',
  'ops_lead',
  'admin',
] as const;
export const USER_STATUSES = ['active', 'suspended', 'pending'] as const;

// Fine-grained staff roles for the RBAC layer — distinct from USER_ROLES.
// These map onto users.role via a fixed table (apps/api/src/modules/staff/
// staff.service.ts ROLE_TO_DB_ROLE); they don't replace the DB enum.
export const STAFF_ROLE_KEYS = [
  'super_admin',
  'platform_admin',
  'ops_lead',
  'ops_inspector',
  'finance_admin',
  'support_admin',
  'auditor',
] as const;
export type StaffRoleKey = (typeof STAFF_ROLE_KEYS)[number];

export const PROPERTY_ROLE_KEYS = ['landlord', 'custodian', 'property_worker', 'student'] as const;
export type PropertyRoleKey = (typeof PROPERTY_ROLE_KEYS)[number];
export const ASSIGNABLE_ROLE_KEYS = [...STAFF_ROLE_KEYS, ...PROPERTY_ROLE_KEYS] as const;
export type AssignableRoleKey = (typeof ASSIGNABLE_ROLE_KEYS)[number];

export const PROPERTY_MEMBERSHIP_ROLES = [
  'landlord',
  'custodian',
  'property_worker',
  'resident_student',
] as const;
export const WORKER_TYPES = [
  'cleaner',
  'security_officer',
  'maintenance_worker',
  'general_worker',
] as const;
export const PROPERTY_OPERATIONAL_STATUSES = [
  'open',
  'temporarily_closed',
  'under_renovation',
  'emergency_closure',
] as const;
export const UNIT_OPERATIONAL_STATUSES = [
  'available',
  'held',
  'occupied',
  'vacant',
  'under_maintenance',
  'blocked',
] as const;

export const UNIVERSITIES = ['MUK', 'MUBS', 'KIU', 'KYU', 'other'] as const;
export const OPS_TEAMS = ['inspector', 'lead'] as const;
export const CATCHMENTS = ['MUK', 'MUBS', 'KIU', 'KYU', 'all'] as const;

export const KYC_STATUSES = ['pending', 'verified', 'rejected'] as const;
export const TOKEN_TYPES = ['phone_otp', 'step_up_otp'] as const;

// Landlord & Property Registration Form parity (0025) — mirrors the
// Google Form's "How do you operate this accommodation?" options.
export const LANDLORD_BUSINESS_TYPES = [
  'individual_landlord',
  'joint_owners',
  'family_business',
  'registered_company',
  'partnership',
  'hostel_management_company',
  'property_agent',
  'university',
  'religious_organisation',
  'other',
] as const;
export const PROPERTY_AUTHORITY_ROLES = [
  'owner',
  'joint_owner',
  'property_manager',
  'caretaker',
  'agent',
  'family_representative',
  'tenant_allowed_to_sublet',
  'other',
] as const;
export const GENDER_ARRANGEMENTS = ['male_only', 'female_only', 'mixed'] as const;
export const RENT_PERIODS = ['monthly', 'per_semester', 'other'] as const;

export const PROPERTY_TYPES = [
  'hostel',
  'apartment',
  'hall',
  'boarding_house',
  'shared_house',
  'studio',
  'other',
] as const;
export const PROPERTY_STATUSES = ['pending_kyc', 'active', 'suspended'] as const;
export const DOC_TYPES = ['title_deed', 'tenancy', 'authorization', 'other'] as const;

// A listing's inventory is priced per room type, not as one flat price — a
// hostel can offer several categories at once (e.g. 30 singles at one price,
// 40 doubles at another), each backed by any number of individual units.
export const ROOM_CATEGORIES = [
  'single',
  'double',
  'triple',
  'quad',
  'studio',
  'self_contained',
  'bedsitter',
  'dormitory',
  'other',
] as const;

export const VISIT_RESULTS = ['pending', 'passed', 'failed'] as const;
export const LISTING_STATUSES = [
  'draft',
  'pending_verification',
  'verified',
  'expired',
  'suspended',
] as const;

// Reserve -> Book -> Move-in (bed-level redesign, 2026-09). 'reserved' and
// 'booked' are the only "active" states — count toward a student's 3-
// reservation platform-wide limit and block the bed for other students.
// 'refunded' is kept for the future automated-refund phase even though no
// Phase-1 code path produces it yet (release/expiry both stop at
// 'released'/'expired' — a human records any actual refund out of band for
// now, same posture as booking payment itself).
export const RESERVATION_STATUSES = [
  'reserved',
  'booked',
  'occupied',
  'released',
  'expired',
  'cancelled',
  'refunded',
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

// Chart-of-accounts classification for the finance ledger (double-entry).
export const LEDGER_ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const;

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

// Predefined tick-items the inspector marks pass/fail within each of the 6
// checklist components. A component's overall pass/fail is DERIVED from these
// (it passes only when every item passes); the free-text notes on a component
// are a fallback for anything the items don't capture. Stored inside the
// existing verification_visits.checklist jsonb (no migration) — the 6-component
// DB gate still reads each component's `passed`, which stays authoritative.
export const CHECKLIST_ITEMS = {
  location_gps: [
    { key: 'gps_match', label: 'GPS matches property location' },
    { key: 'address_found', label: 'Property found at the stated address' },
    { key: 'neighborhood', label: 'Neighborhood matches the listing' },
  ],
  rooms_capacity: [
    { key: 'room_count', label: 'Room count matches the listing' },
    { key: 'beds_per_room', label: 'Beds per room match' },
    { key: 'self_contained_match', label: 'Self-contained status matches the claim' },
    { key: 'room_sizes', label: 'Room sizes are reasonable' },
  ],
  amenities: [
    { key: 'water', label: 'Water' },
    { key: 'electricity', label: 'Electricity' },
    { key: 'wifi', label: 'Wi-Fi (if claimed)' },
    { key: 'security', label: 'Security (gate / guard)' },
    { key: 'bathroom', label: 'Bathroom / toilet' },
    { key: 'kitchen', label: 'Kitchen' },
    { key: 'furniture', label: 'Furniture matches the listing' },
  ],
  photos: [
    { key: 'photos_of_property', label: 'Photos are of this property' },
    { key: 'no_stock', label: 'No stock / misleading photos' },
    { key: 'key_areas', label: 'Key areas photographed' },
  ],
  landlord_identity: [
    { key: 'identity_verified', label: 'Identity verified' },
    { key: 'id_matches', label: 'ID document matches' },
    { key: 'authorization', label: 'Authorization to list confirmed' },
  ],
  safety: [
    { key: 'fire', label: 'Fire safety (extinguisher / exits)' },
    { key: 'electrical', label: 'Electrical wiring safe' },
    { key: 'structural', label: 'Structural condition sound' },
    { key: 'lighting', label: 'Adequate lighting' },
    { key: 'emergency_access', label: 'Emergency access' },
  ],
} as const satisfies Record<VerificationChecklistComponent, readonly { key: string; label: string }[]>;

export type UserRole = (typeof USER_ROLES)[number];
export type UserStatus = (typeof USER_STATUSES)[number];
export type PropertyMembershipRole = (typeof PROPERTY_MEMBERSHIP_ROLES)[number];
export type WorkerType = (typeof WORKER_TYPES)[number];
export type PropertyOperationalStatus = (typeof PROPERTY_OPERATIONAL_STATUSES)[number];
export type UnitOperationalStatus = (typeof UNIT_OPERATIONAL_STATUSES)[number];
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
export type LedgerAccountType = (typeof LEDGER_ACCOUNT_TYPES)[number];
export type LandlordBusinessType = (typeof LANDLORD_BUSINESS_TYPES)[number];
export type PropertyAuthorityRole = (typeof PROPERTY_AUTHORITY_ROLES)[number];
export type GenderArrangement = (typeof GENDER_ARRANGEMENTS)[number];
export type RentPeriod = (typeof RENT_PERIODS)[number];
