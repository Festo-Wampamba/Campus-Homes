const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

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

// One thin wrapper (FRONTEND.md §5). Request/response shapes come from
// @campushomes/shared — never hand-write them (brief §14).
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    throw new ApiError(res.status, await res.json().catch(() => null));
  }
  return res.json() as Promise<T>;
}
