import { headers } from "next/headers";

import { API_TIMEOUT_MS } from "./api";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

// Server-component counterpart to lib/api.ts: forwards the incoming
// request's session cookie since server components can't rely on fetch's
// browser `credentials: 'include'` (session.ts pattern).
export async function apiServer<T>(path: string): Promise<T | null> {
  const cookie = (await headers()).get("cookie");
  if (!cookie) return null;
  try {
    const res = await fetch(`${BASE}/api/v1${path}`, {
      headers: { cookie },
      cache: "no-store",
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// apiServer() collapses "not signed in", "API is down", and "genuinely no
// data" into the same null/[] — fine for most callers, but wrong for a
// queue/list page where "nothing to do" and "couldn't reach the API" must
// look different to the person reading it. A transient backend blip (a
// Render cold start, a mid-deploy restart window) rendering as a calm
// "queue is clear" is actively misleading: an ops lead has no reason to
// suspect anything's wrong and just... doesn't approve anything. This
// throws instead, so the caller can render a real error state.
// For genuinely public endpoints only (no auth required at all) — unlike
// apiServer(), never short-circuits on a missing cookie. The QR-scan tenant
// agreement flow is the reason this exists: a first-time visitor scanning a
// property's QR code has no session cookie by definition, so apiServer()'s
// "no cookie -> null" shortcut made GET /listings/properties/:id/summary
// return null before the request was ever sent, 404ing the page before it
// could even reach the sign-in redirect meant to handle exactly this case.
export async function apiServerPublic<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}/api/v1${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function apiServerStrict<T>(path: string): Promise<T> {
  const cookie = (await headers()).get("cookie");
  if (!cookie) {
    throw new Error("Not signed in");
  }
  const res = await fetch(`${BASE}/api/v1${path}`, {
    headers: { cookie },
    cache: "no-store",
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`API request to ${path} failed with ${res.status}`);
  }
  return (await res.json()) as T;
}
