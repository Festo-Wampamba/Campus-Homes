import type { AccountAccess } from "@campushomes/shared";
import { authDestination, authorizedNext, workspaceGuardDestination } from "./auth-routing";

const access = (workspaces: AccountAccess["workspaces"], overrides: Partial<AccountAccess> = {}): AccountAccess => ({
  workspaces, roles: [], onboarding: { student: false, landlord: false },
  assurance: { authenticatedAt: null, mfaVerified: false }, ...overrides,
});
const session = (grants: AccountAccess, status = "active") => ({ access: grants, user: { status } });

describe("workspace routing", () => {
  it.each([
    ["super_admin", "/admin"], ["platform_admin", "/admin"],
    ["finance_admin", "/admin/finance"], ["support_admin", "/admin/inquiries"],
    ["auditor", "/admin/audit-log"],
  ])("routes %s to its working dashboard", (role, destination) => {
    expect(authDestination(session(access(["admin"], {
      roles: [role], assurance: { authenticatedAt: new Date().toISOString(), mfaVerified: true },
    })))).toBe(destination);
  });
  it.each(["ops_lead", "ops_inspector"])("routes %s to operations", (role) => {
    expect(authDestination(session(access(["ops"], {
      roles: [role], assurance: { authenticatedAt: new Date().toISOString(), mfaVerified: true },
    })))).toBe("/ops");
  });
  it.each([
    ["student", ["student"], "/"],
    ["landlord", ["landlord"], "/landlord"],
    ["dual consumer", ["student", "landlord"], "/choose-workspace"],
    ["consumer plus staff", ["student", "admin"], "/choose-workspace"],
  ] as const)("routes the %s account matrix case", (_label, workspaces, destination) => {
    const accountWorkspaces: AccountAccess["workspaces"] = [...workspaces];
    expect(authDestination(session(access(accountWorkspaces, {
      roles: accountWorkspaces.includes("admin") ? ["support_admin"] : [],
      assurance: { authenticatedAt: new Date().toISOString(), mfaVerified: true },
    })))).toBe(destination);
  });
  it("chooses among multiple grants instead of selecting a primary role", () => {
    expect(authDestination(session(access(["student", "landlord"])))).toBe("/choose-workspace");
    expect(authDestination(session(access([])))).toBe("/access-required");
    expect(authDestination(session(access(["student"])))).toBe("/");
  });

  it("honors an authorized next with query and fragment", () => {
    expect(authDestination(session(access(["student", "landlord"])), "/landlord/properties?tab=rooms#new")).toBe("/landlord/properties?tab=rooms#new");
  });

  it.each(["/admin", "/ops/inspect", "/landlord", "/api/auth/logto/sign-out", "/auth/callback", "/sign-in", "/unknown"])("discards unauthorized or non-navigation next %s", (next) => {
    expect(authDestination(session(access(["student"])), next)).toBe("/");
  });

  it.each(["https://evil.test", "//evil.test", "/\\evil.test", "/%5cevil.test", "/%2fevil.test", "/%00", "/bad%", "/\n/evil.test", "/landlord/../../admin", "/landlord/%2e%2e/admin", "/landlord%2f..%2fadmin", "/%2561dmin"])("rejects ambiguous or unauthorized next %s", (next) => {
    expect(authorizedNext(access(["landlord"]), next)).toBeNull();
  });

  it("authorizes after dot-segment normalization", () => {
    expect(authorizedNext(access(["student"]), "/admin/../profile?next=%2Fsearch")).toBe("/profile?next=%2Fsearch");
    expect(authorizedNext(access(["landlord"]), "/landlord/../admin")).toBeNull();
    expect(authorizedNext(access(["landlord"]), "/landlordish")).toBeNull();
  });

  it("routes incomplete landlords to onboarding, including bookmarked pages", () => {
    const grants = access(["landlord"], { onboarding: { student: false, landlord: true } });
    expect(authDestination(session(grants), "/landlord/properties")).toBe("/landlord/onboarding");
    expect(workspaceGuardDestination(session(grants), "landlord", "/landlord/profile")).toBe("/landlord/onboarding");
    expect(workspaceGuardDestination(session(grants), "landlord", "/landlord/onboarding")).toBeNull();
  });

  it.each(["ops", "admin"] as const)("requires verified MFA for %s, preserving next", (workspace) => {
    const grants = access([workspace]);
    expect(authDestination(session(grants), `/${workspace}?tab=one`)).toBe(`/mfa-required?next=${encodeURIComponent(`/${workspace}?tab=one`)}`);
    expect(workspaceGuardDestination(session(grants), workspace, `/${workspace}`)).toBe(`/mfa-required?next=%2F${workspace}`);
    grants.assurance.mfaVerified = true;
    expect(workspaceGuardDestination(session(grants), workspace, `/${workspace}`)).toBeNull();
  });

  it.each(["pending", "suspended"])("blocks %s before next, workspace and MFA checks", (status) => {
    const account = session(access(["student", "admin"]), status);
    expect(authDestination(account, "/search")).toBe("/account-pending");
    expect(workspaceGuardDestination(account, "admin", "/admin")).toBe("/account-pending");
    expect(workspaceGuardDestination(account, "landlord", "/landlord")).toBe("/account-pending");
  });

  it("keeps missing authentication separate from missing grants", () => {
    expect(workspaceGuardDestination(null, "ops", "/ops/inspect?a=1")).toBe("/sign-in?next=%2Fops%2Finspect%3Fa%3D1");
    expect(workspaceGuardDestination(session(access(["student"])), "admin", "/admin")).toBe("/access-required");
  });

  it("allows deliberate landlord enrollment without a landlord grant", () => {
    expect(authDestination(session(access(["student"])), "/landlords/enroll")).toBe("/landlords/enroll");
  });
});
