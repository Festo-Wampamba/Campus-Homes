import type { Env } from '../../config/env';

/** Logto rejected a primary-email update because the address is already in
 * use by another Logto identity (HTTP 422). Kept Nest-free so the client
 * stays framework-agnostic; callers map it to a ConflictException. */
export class LogtoEmailConflictError extends Error {
  constructor() {
    super('That email is already in use by another account');
    this.name = 'LogtoEmailConflictError';
  }
}

/**
 * Thin wrapper around Logto's Management API for provisioning — creating
 * users, setting passwords, and issuing one-time-token magic links. Auths
 * via the M2M application (client_credentials grant), separate from the
 * end-user OIDC applications in logto.config.ts. Never used for end-user
 * session issuance.
 *
 * Verified against the live Logto instance during Phase 1 provisioning:
 * client_credentials grant + GET /api/applications round-tripped correctly.
 */
export class LogtoManagementClient {
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(private readonly env: Env) {
    if (!env.LOGTO_ENDPOINT || !env.LOGTO_M2M_APP_ID || !env.LOGTO_M2M_APP_SECRET) {
      throw new Error('LogtoManagementClient requires LOGTO_ENDPOINT/LOGTO_M2M_APP_ID/LOGTO_M2M_APP_SECRET');
    }
  }

  private async getToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 30_000) {
      return this.tokenCache.token;
    }
    const res = await fetch(`${this.env.LOGTO_ENDPOINT}/oidc/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.env.LOGTO_M2M_APP_ID!,
        client_secret: this.env.LOGTO_M2M_APP_SECRET!,
        resource: this.env.LOGTO_MANAGEMENT_API_RESOURCE ?? 'https://default.logto.app/api',
        scope: 'all',
      }),
    });
    if (!res.ok) {
      throw new Error(`Logto Management API token request failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.tokenCache = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.getToken();
    const res = await fetch(`${this.env.LOGTO_ENDPOINT}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
    if (!res.ok) {
      throw new Error(`Logto Management API ${init.method ?? 'GET'} failed: HTTP ${res.status}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  async createUser(input: {
    primaryEmail?: string;
    primaryPhone?: string;
    name?: string;
    password?: string;
  }): Promise<{ id: string }> {
    return this.request<{ id: string }>('/api/users', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /** Sets the identity's sign-in email at Logto (the source of truth for
   * email/password and magic-link sign-in). Only call once the caller has
   * proven ownership of the address — a management PATCH is trusted by Logto
   * and marks the email verified. A 422 means it is already on another
   * identity. */
  async updatePrimaryEmail(logtoUserId: string, email: string): Promise<void> {
    const token = await this.getToken();
    const res = await fetch(`${this.env.LOGTO_ENDPOINT}/api/users/${logtoUserId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ primaryEmail: email }),
    });
    if (res.status === 422) throw new LogtoEmailConflictError();
    if (!res.ok) throw new Error(`Logto Management API PATCH user failed: HTTP ${res.status}`);
  }

  async setPassword(logtoUserId: string, password: string): Promise<void> {
    await this.request(`/api/users/${logtoUserId}/password`, {
      method: 'PATCH',
      body: JSON.stringify({ password }),
    });
  }

  /** Creates a magic-link token redeemable via the sign-in flow's
   * `extraParams.one_time_token` — see auth.controller.ts's sign-in
   * endpoint. `interactionEvent` scopes what the link is for. */
  async createOneTimeToken(
    email: string,
    interactionEvent: 'SignIn' | 'Register' | 'ForgotPassword' = 'ForgotPassword',
    expiresInSeconds = 60 * 60 * 24, // 24h, matches the invite-link window staff invites already relied on
  ): Promise<{ token: string }> {
    return this.request<{ token: string }>('/api/one-time-tokens', {
      method: 'POST',
      body: JSON.stringify({ email, context: { interactionEvent }, expiresIn: expiresInSeconds }),
    });
  }

  /** The Sign-in Experience is tenant-wide in self-hosted Logto (see
   * logto.config.ts's header comment) — one call brands the hosted UI for
   * both the consumer and staff applications. */
  async getSignInExperience(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>('/api/sign-in-exp');
  }

  async updateSignInExperience(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>('/api/sign-in-exp', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }
}
