import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { WORKSPACES, type AccountAccess, type UserRole, type Workspace } from "@campushomes/shared";

import { API_TIMEOUT_MS } from "./api";
import { WORKSPACE_HOME, workspaceGuardDestination } from "./auth-routing";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export type { UserRole };

export interface SessionUser {
  id: string;
  role: UserRole;
  status: "active" | "suspended" | "pending";
  name: string | null;
  email: string | null;
  phoneNumber: string | null;
}

export interface Session {
  user: SessionUser;
  access: AccountAccess;
}

type RawSessionResponse = {
  user: { id: string; role: UserRole; status: SessionUser["status"]; name: string; email: string | null; phone: string | null };
  access: AccountAccess;
} | null;

export class SessionServiceUnavailableError extends Error {
  constructor() {
    super("The account service is temporarily unavailable. Please try again.");
    this.name = "SessionServiceUnavailableError";
  }
}

function validAccess(value: AccountAccess | undefined): value is AccountAccess {
  return !!value && Array.isArray(value.workspaces) && value.workspaces.every((workspace) => WORKSPACES.includes(workspace))
    && (value.permissions === undefined || (Array.isArray(value.permissions) && value.permissions.every(permission => typeof permission === "string")))
    && Array.isArray(value.roles) && value.roles.every((role) => typeof role === "string")
    && typeof value.onboarding?.student === "boolean" && typeof value.onboarding?.landlord === "boolean"
    && typeof value.assurance?.mfaVerified === "boolean"
    && (value.assurance.authenticatedAt === null || typeof value.assurance.authenticatedAt === "string");
}

// Server-side session lookup for layout guards: forward the request cookies
// to the API's session endpoint. UX-level gating only — RLS + API
// validation are the real enforcement (FRONTEND.md §6).
export const getServerSession = cache(async (): Promise<Session | null> => {
  const cookie = (await headers()).get("cookie");
  if (!cookie) return null;
  try {
    const res = await fetch(`${BASE}/api/auth/session`, {
      headers: { cookie },
      cache: "no-store",
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (res.status === 401) return null;
    if (!res.ok) throw new SessionServiceUnavailableError();
    const data = (await res.json()) as RawSessionResponse;
    if (!data) return null;
    if (!data.user?.id || !["active", "pending", "suspended"].includes(data.user.status) || !validAccess(data.access)) {
      throw new SessionServiceUnavailableError();
    }
    return { user: { ...data.user, phoneNumber: data.user.phone }, access: data.access };
  } catch {
    // Do not turn a deployment outage or malformed contract into a login loop.
    throw new SessionServiceUnavailableError();
  }
});

export async function requireSession(next = "/choose-workspace"): Promise<Session> {
  const session = await getServerSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  if (session.user.status !== "active") redirect("/account-pending");
  return session;
}

export async function requireWorkspace(workspace: Workspace, path?: string): Promise<Session> {
  const session = await getServerSession();
  const next = path ?? (await headers()).get("x-campushomes-path") ?? WORKSPACE_HOME[workspace];
  const destination = workspaceGuardDestination(session, workspace, next);
  if (destination) redirect(destination);
  return session!;
}
