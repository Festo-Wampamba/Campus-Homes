import type { PropertySummary, TenantAgreement, TenantAgreementTemplate } from "@campushomes/shared";

import { apiServer, apiServerPublic } from "@/lib/server-api";

// Genuinely public (no session cookie required) — a QR-scan visitor hasn't
// necessarily signed in yet, and this is the call that has to work before
// the sign-in redirect even runs. See apiServerPublic()'s own comment.
export function getPropertySummary(propertyId: string): Promise<PropertySummary | null> {
  return apiServerPublic<PropertySummary>(`/listings/properties/${propertyId}/summary`);
}

// null = the landlord/custodian hasn't set up a form for this property yet.
export function getTenantAgreementTemplate(propertyId: string): Promise<TenantAgreementTemplate | null> {
  return apiServer<TenantAgreementTemplate>(`/tenant-agreements/template/${propertyId}`);
}

// null = the student hasn't submitted an agreement for this property yet.
export function getMyTenantAgreement(propertyId: string): Promise<TenantAgreement | null> {
  return apiServer<TenantAgreement | null>(`/tenant-agreements/mine/${propertyId}`);
}
