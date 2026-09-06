// Relative in the browser: next.config.ts's rewrites() proxy this same-origin
// to the real API, which is what lets the session cookie be host-only. But
// this helper is also called from server components (e.g. the public listing
// detail page, for its typed ApiError/404 handling) — Node's fetch, unlike a
// browser's, can't resolve a relative URL, so it needs the real absolute
// origin server-side. Same BASE logic as lib/server-api.ts.
const BASE = typeof window === "undefined" ? (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000") : "";

// 400s carry Zod issue detail in nestjs-zod format (FRONTEND.md §1).
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`API ${status}`);
    this.name = "ApiError";
  }
}

type ApiErrorBody = {
  message?: unknown;
  error?: unknown;
  errors?: unknown;
};

function issueMessage(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (!value || typeof value !== "object") return null;
  const issue = value as { message?: unknown; path?: unknown };
  if (typeof issue.message !== "string" || !issue.message.trim()) return null;
  const path = Array.isArray(issue.path) ? issue.path.map(String).join(" → ") : "";
  return path ? `${path}: ${issue.message}` : issue.message;
}

/** Extracts actionable Nest/Zod/conflict detail instead of hiding every 4xx. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  const body = error.body as ApiErrorBody | null;
  if (!body || typeof body !== "object") return `${fallback} (API ${error.status})`;

  const errors = Array.isArray(body.errors) ? body.errors : [];
  const detailed = errors.map(issueMessage).filter((message): message is string => Boolean(message));
  if (detailed.length) return detailed.join(" ");

  const messages = Array.isArray(body.message) ? body.message : [body.message];
  const actionable = messages.map(issueMessage).filter((message): message is string => Boolean(message));
  if (actionable.length && !actionable.every((message) => message === "Validation failed")) {
    return actionable.join(" ");
  }
  return `${fallback} (API ${error.status})`;
}

// A hung API must reject, not stall. An unreachable host refuses fast, but a
// host that accepts the connection and never replies (Render holds the socket
// open while a service crash-loops) leaves fetch pending forever — which in a
// server component burns the whole function timeout and 504s the page instead
// of hitting the caller's catch. Generous enough for a slow mobile POST.
export const API_TIMEOUT_MS = 15_000;

// One thin wrapper (FRONTEND.md §5). Request/response shapes come from
// @campushomes/shared — never hand-write them (brief §14).
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    ...init,
    credentials: "include",
    signal: init?.signal ?? AbortSignal.timeout(API_TIMEOUT_MS),
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    throw new ApiError(res.status, await res.json().catch(() => null));
  }
  return res.json() as Promise<T>;
}
