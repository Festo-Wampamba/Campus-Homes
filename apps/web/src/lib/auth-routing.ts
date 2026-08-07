import { USER_ROLES } from "@campushomes/shared";

const HOME_BY_ROLE: Readonly<Record<string, string>> = {
  student: "/",
  landlord: "/landlord",
  ops_inspector: "/ops",
  ops_lead: "/ops",
  admin: "/admin",
};

export class SessionVerificationError extends Error {
  constructor() {
    super("Sign-in succeeded, but the secure session could not be verified. Please try again.");
    this.name = "SessionVerificationError";
  }
}

// custodian/property_worker are real users.role values (packages/shared
// USER_ROLES) with no dedicated web portal yet — fall back to "/" for them
// like every other unmapped-but-real role, and reserve the thrown error for
// a role that isn't a real account role at all.
export function homeForAuthenticatedRole(role: unknown): string {
  if (typeof role !== "string" || !(USER_ROLES as readonly string[]).includes(role)) {
    throw new SessionVerificationError();
  }
  return HOME_BY_ROLE[role] ?? "/";
}
