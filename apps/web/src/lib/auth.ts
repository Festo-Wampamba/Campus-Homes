const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export type Portal = "consumer" | "staff";

/** Redirects the browser into Logto's hosted sign-in experience via the
 * API's BFF endpoint — phone-OTP, email/password, and Google all live on
 * that one hosted screen, provisioned per-connector server-side. `portal`
 * picks which OIDC application (and therefore which app's own session)
 * the sign-in targets; `next` survives the round trip via a short-lived
 * cookie the API sets, and comes back out at /auth/callback. */
export function signInUrl(portal: Portal, next?: string): string {
  const params = new URLSearchParams({ portal });
  if (next) params.set("next", next);
  return `${BASE}/api/auth/logto/sign-in?${params.toString()}`;
}

export async function signOut(): Promise<void> {
  await fetch(`${BASE}/api/auth/logto/sign-out`, { method: "POST", credentials: "include" });
}
