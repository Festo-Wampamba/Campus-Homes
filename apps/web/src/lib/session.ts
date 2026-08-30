import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { UserRole } from "@campushomes/shared";

import { API_TIMEOUT_MS } from "./api";

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
}

// Server-side session lookup for layout guards: forward the request cookies
// to the API's Better Auth handler. UX-level gating only — RLS + API
// validation are the real enforcement (FRONTEND.md §6).
export async function getServerSession(): Promise<Session | null> {
  const cookie = (await headers()).get("cookie");
  if (!cookie) return null;
  try {
    const res = await fetch(`${BASE}/api/auth/get-session`, {
      headers: { cookie },
      cache: "no-store",
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return ((await res.json()) as Session | null) ?? null;
  } catch {
    // API unreachable or hung — treat as signed out rather than crashing the
    // shell. Fails closed: a timed-out guard redirects to sign-in.
    return null;
  }
}

export async function requireRole(
  roles: readonly UserRole[],
  signInPath = "/sign-in",
): Promise<Session> {
  const session = await getServerSession();
  if (!session || !roles.includes(session.user.role)) {
    redirect(signInPath);
  }
  // A pending (self-registered, unapproved) or suspended account still has a
  // valid session — Better Auth's own sign-in doesn't check this custom
  // column. Catch it here too, not just at the sign-in form's own routing,
  // so a bookmarked/`next`-redirected portal URL can't skip straight past
  // it into a page whose first API call would just 401 from AuthGuard.
  if (session.user.status !== "active") {
    redirect("/account-pending");
  }
  return session;
}
