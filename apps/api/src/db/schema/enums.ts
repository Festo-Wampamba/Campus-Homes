import { pgEnum } from 'drizzle-orm/pg-core';
import {
  CATCHMENTS,
  DOC_TYPES,
  KYC_STATUSES,
  LISTING_STATUSES,
  MOVE_IN_CONFIRMER_ROLES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUSES,
  OPS_TEAMS,
  PAYMENT_METHODS,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  REFUND_REASONS,
  REFUND_STATUSES,
  REPUTATION_SUBJECT_TYPES,
  RESERVATION_STATUSES,
  STRIKE_REASONS,
  STUDENT_FLAG_REASONS,
  TOKEN_TYPES,
  UNIVERSITIES,
  USER_ROLES,
  USER_STATUSES,
  VISIT_RESULTS,
} from '@campushomes/shared';

// Every pgEnum derives from the shared arrays — DB and validation can't drift.
export const userRole = pgEnum('user_role', USER_ROLES);
export const userStatus = pgEnum('user_status', USER_STATUSES);
export const university = pgEnum('university', UNIVERSITIES);
export const opsTeam = pgEnum('ops_team', OPS_TEAMS);
export const catchment = pgEnum('catchment', CATCHMENTS);
export const kycStatus = pgEnum('kyc_status', KYC_STATUSES);
export const tokenType = pgEnum('token_type', TOKEN_TYPES);
export const propertyType = pgEnum('property_type', PROPERTY_TYPES);
export const propertyStatus = pgEnum('property_status', PROPERTY_STATUSES);
export const docType = pgEnum('doc_type', DOC_TYPES);
export const visitResult = pgEnum('visit_result', VISIT_RESULTS);
export const listingStatus = pgEnum('listing_status', LISTING_STATUSES);
export const reservationStatus = pgEnum('reservation_status', RESERVATION_STATUSES);
export const paymentProvider = pgEnum('payment_provider', PAYMENT_PROVIDERS);
export const paymentMethod = pgEnum('payment_method', PAYMENT_METHODS);
export const paymentStatus = pgEnum('payment_status', PAYMENT_STATUSES);
export const refundReason = pgEnum('refund_reason', REFUND_REASONS);
export const refundStatus = pgEnum('refund_status', REFUND_STATUSES);
export const moveInConfirmerRole = pgEnum('move_in_confirmer_role', MOVE_IN_CONFIRMER_ROLES);
export const strikeReason = pgEnum('strike_reason', STRIKE_REASONS);
export const studentFlagReason = pgEnum('student_flag_reason', STUDENT_FLAG_REASONS);
export const reputationSubjectType = pgEnum('reputation_subject_type', REPUTATION_SUBJECT_TYPES);
export const notificationChannel = pgEnum('notification_channel', NOTIFICATION_CHANNELS);
export const notificationStatus = pgEnum('notification_status', NOTIFICATION_STATUSES);
