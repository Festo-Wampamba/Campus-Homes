import { safeAuthDestination, type AccountAccess, type Workspace } from "@campushomes/shared";

export const WORKSPACE_HOME: Record<Workspace, string> = {
  student: "/",
  landlord: "/landlord",
  ops: "/ops",
  admin: "/admin",
};

export const WORKSPACE_LABEL: Record<Workspace, string> = {
  student: "Student", landlord: "Landlord", ops: "Operations", admin: "Administration",
};

type RoutingSession = { user: { status: string }; access: AccountAccess };

function within(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

export function workspaceForPath(path: string): Workspace | null {
  for (const workspace of ["landlord", "ops", "admin"] as const) {
    if (within(path, `/${workspace}`)) return workspace;
  }
  if (["/profile", "/reservations", "/messages", "/saved", "/recently-viewed", "/calendar", "/agreement"].some((root) => within(path, root))) return "student";
  return null;
}

/** Check authorization against the normalized pathname, never the raw next. */
export function authorizedNext(access: AccountAccess, rawNext: unknown): string | null {
  const next = safeAuthDestination(rawNext);
  if (!next) return null;
  const path = new URL(next, "https://campushomes.invalid").pathname;
  // Encoded path delimiters and double encoding can be decoded differently by
  // the proxy/router. Queries remain encoded and may contain arbitrary values.
  if (path.includes("%")) return null;
  const workspace = workspaceForPath(path);
  if (workspace) return access.workspaces.includes(workspace) ? next : null;
  const publicPath = ["/", "/search", "/support", "/landlords", "/landlords/enroll"].includes(path) || within(path, "/listings");
  return publicPath ? next : null;
}

export function workspaceHome(access: AccountAccess, workspace: Workspace): string {
  if (workspace !== "admin") return WORKSPACE_HOME[workspace];
  if (access.roles.some(role => ["super_admin", "platform_admin"].includes(role))) return "/admin";
  if (access.roles.includes("finance_admin")) return "/admin/finance";
  if (access.roles.includes("support_admin")) return "/admin/inquiries";
  if (access.roles.includes("auditor")) return "/admin/audit-log";
  return "/admin";
}

export function workspaceDestination(access: AccountAccess, workspace: Workspace, next = workspaceHome(access, workspace)): string {
  if (!access.workspaces.includes(workspace)) return "/access-required";
  if ((workspace === "ops" || workspace === "admin") && !access.assurance.mfaVerified) {
    return `/mfa-required?next=${encodeURIComponent(next)}`;
  }
  if (workspace === "landlord" && access.onboarding.landlord) return "/landlord/onboarding";
  return next;
}

export function authDestination(session: RoutingSession, rawNext?: unknown): string {
  if (session.user.status !== "active") return "/account-pending";
  const { access } = session;
  const next = authorizedNext(access, rawNext);
  if (next) {
    const workspace = workspaceForPath(new URL(next, "https://campushomes.invalid").pathname);
    return workspace ? workspaceDestination(access, workspace, next) : next;
  }
  const workspaces = [...new Set(access.workspaces)];
  if (!workspaces.length) return "/access-required";
  if (workspaces.length === 1) return workspaceDestination(access, workspaces[0]);
  return "/choose-workspace";
}

export function workspaceGuardDestination(session: RoutingSession | null, workspace: Workspace, requestedPath = WORKSPACE_HOME[workspace]): string | null {
  const next = safeAuthDestination(requestedPath) ?? WORKSPACE_HOME[workspace];
  if (!session) return `/sign-in?next=${encodeURIComponent(next)}`;
  if (session.user.status !== "active") return "/account-pending";
  if (!session.access.workspaces.includes(workspace)) return "/access-required";
  const destination = workspaceDestination(session.access, workspace, next);
  // The onboarding page itself must remain reachable without a redirect loop.
  if (destination === "/landlord/onboarding" && new URL(next, "https://campushomes.invalid").pathname === destination) return null;
  return destination === next ? null : destination;
}
