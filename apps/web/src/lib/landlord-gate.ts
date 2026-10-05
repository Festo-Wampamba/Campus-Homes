// Where a landlord must be sent instead of the page they asked for, or null
// to let them stay. Kept pure so every combination is unit-tested: the two
// layouts are thin callers.
export const ONBOARDING_PATH = "/landlord/onboarding";
export const APPROVAL_PATH = "/landlord/approval-pending";

export type GateProfile = { kycStatus: "pending" | "verified" | "rejected" } | null;

export function dashboardGate(profile: GateProfile, hasProperty: boolean): string | null {
  if (!profile) return ONBOARDING_PATH;
  if (profile.kycStatus !== "verified") return hasProperty ? APPROVAL_PATH : ONBOARDING_PATH;
  // A verified landlord with no property is handled by the dashboard page
  // itself (it opens onboarding), which setupGate lets them stay on.
  return null;
}

export function setupGate(profile: GateProfile, hasProperty: boolean, path: string): string | null {
  const onApproval = path.startsWith(APPROVAL_PATH);
  if (profile?.kycStatus === "verified") return onApproval || hasProperty ? "/landlord" : null;
  if (onApproval) return profile && hasProperty ? null : ONBOARDING_PATH;
  return profile && hasProperty ? APPROVAL_PATH : null;
}
