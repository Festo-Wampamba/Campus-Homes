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

export function homeForAuthenticatedRole(role: unknown): string {
  if (typeof role !== "string" || !HOME_BY_ROLE[role]) {
    throw new SessionVerificationError();
  }
  return HOME_BY_ROLE[role];
}
