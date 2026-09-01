import type { LogtoConfig } from '@logto/node';

import type { Env } from '../../config/env';

export type Portal = 'consumer' | 'staff';

/**
 * Two OIDC applications share one Logto tenant: consumer (students +
 * landlords, self-serve) and staff (admin/ops, invite-only) — separate
 * client_id/secret for blast-radius isolation. Sign-up methods themselves
 * are tenant-wide in self-hosted Logto (per-application Sign-in Experience
 * only customizes branding), so "staff is invite-only" is enforced in
 * ProvisioningService, not by hiding buttons on a Logto-hosted screen.
 */
export function logtoConfigFor(env: Env, portal: Portal): LogtoConfig {
  if (!env.LOGTO_ENDPOINT) {
    throw new Error('AuthModule requires LOGTO_ENDPOINT');
  }
  const appId = portal === 'staff' ? env.LOGTO_STAFF_APP_ID : env.LOGTO_CONSUMER_APP_ID;
  const appSecret = portal === 'staff' ? env.LOGTO_STAFF_APP_SECRET : env.LOGTO_CONSUMER_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error(`AuthModule requires LOGTO_${portal.toUpperCase()}_APP_ID/SECRET`);
  }
  return {
    endpoint: env.LOGTO_ENDPOINT,
    appId,
    appSecret,
    scopes: ['profile', 'email', 'phone'],
  };
}

/** This API's own public origin — used to build the Logto redirect_uri and
 * magic-link sign-in URLs. Falls back to localhost for local dev. */
export function apiOrigin(env: Env): string {
  return (env.AUTH_API_URL ?? `http://localhost:${env.PORT}`).replace(/\/$/, '');
}

/** A magic-link URL that redeems a Management-API-issued one-time-token —
 * see logto-management.client.ts's createOneTimeToken() and
 * auth.controller.ts's sign-in endpoint, which forwards it to Logto via
 * `extraParams.one_time_token`. */
export function magicSignInUrl(env: Env, portal: Portal, token: string, email: string): string {
  const params = new URLSearchParams({ portal, token, email });
  return `${apiOrigin(env)}/api/auth/logto/sign-in?${params.toString()}`;
}
