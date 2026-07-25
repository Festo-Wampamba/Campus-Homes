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
