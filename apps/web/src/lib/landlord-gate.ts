// Where a landlord must be sent instead of the page they asked for, or null
// to let them stay. Kept pure so every combination is unit-tested: the two
// layouts are thin callers.
export const ONBOARDING_PATH = "/landlord/onboarding";
export const APPROVAL_PATH = "/landlord/approval-pending";

export type GateProfile = { kycStatus: "pending" | "verified" | "rejected" } | null;

// null = the property list couldn't be loaded. Treated as "has a property"
// for pending landlords: the review page offers nothing to submit, whereas
// reopening the wizard for someone who already submitted invites a duplicate.
export type PropertyState = boolean | null;

export function dashboardGate(profile: GateProfile, hasProperty: PropertyState): string | null {
  if (!profile) return ONBOARDING_PATH;
  // Rejected landlords can't submit a property (the API refuses), so the
  // review page with the support email is the only useful destination.
  if (profile.kycStatus === "rejected") return APPROVAL_PATH;
  if (profile.kycStatus === "pending") return hasProperty === false ? ONBOARDING_PATH : APPROVAL_PATH;
  // A verified landlord with no property is handled by the dashboard page
  // itself (it opens onboarding), which setupGate lets them stay on.
  return null;
}

export function setupGate(profile: GateProfile, hasProperty: PropertyState, path: string): string | null {
  const onApproval = path.startsWith(APPROVAL_PATH);
  if (profile?.kycStatus === "verified") return onApproval || hasProperty === true ? "/landlord" : null;
  if (profile?.kycStatus === "rejected") return onApproval ? null : APPROVAL_PATH;
  if (onApproval) return profile && hasProperty !== false ? null : ONBOARDING_PATH;
  return profile && hasProperty !== false ? APPROVAL_PATH : null;
}
