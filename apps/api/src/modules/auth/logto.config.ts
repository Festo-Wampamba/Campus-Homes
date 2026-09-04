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

/** The web app's public origin. The Logto redirect_uri and magic-link
 * sign-in URLs point here instead of at this API directly — apps/web's
 * next.config.ts rewrites /api/auth/* and /api/v1/* to the real API
 * server-side, so from the browser's perspective every request in the
 * OIDC flow, including the one that sets the session cookie, is
 * same-origin with the web app. That's what lets the session cookie be
 * host-only instead of needing AUTH_COOKIE_DOMAIN scoped to the whole
 * apex (see auth.controller.ts's callback handler). */
export function webOrigin(env: Env): string {
  return env.WEB_ORIGIN.replace(/\/$/, '');
}

/** A magic-link URL that redeems a Management-API-issued one-time-token —
 * see logto-management.client.ts's createOneTimeToken() and
 * auth.controller.ts's sign-in endpoint, which forwards it to Logto via
 * `extraParams.one_time_token`. */
export function magicSignInUrl(env: Env, portal: Portal, token: string, email: string): string {
  const params = new URLSearchParams({ portal, token, email });
  return `${webOrigin(env)}/api/auth/logto/sign-in?${params.toString()}`;
}
