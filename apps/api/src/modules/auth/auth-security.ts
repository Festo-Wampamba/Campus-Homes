import { createHash, timingSafeEqual } from 'node:crypto';
import type { AuthenticationAssurance } from '@campushomes/shared';

export type AssuranceFailure =
  | 'policy_disabled'
  | 'missing_auth_time'
  | 'stale_authentication'
  | 'missing_mfa_claim';

export function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Driver error messages (pg, ioredis, etc.) sometimes echo the connection
 * URL verbatim, credentials included. Strip any userinfo before logging. */
export function redactSecrets(message: string): string {
  return message.replace(/(\w+:\/\/)[^/\s@]+@/g, '$1***@');
}

export function matchesSecret(actual: string, expected: string): boolean {
  return timingSafeEqual(Buffer.from(digest(actual)), Buffer.from(digest(expected)));
}

function assuranceFailure(
  claims: Record<string, unknown>,
  startedAt: number,
  staffFlow: boolean,
  policyVerified: boolean,
  now: number,
): AssuranceFailure | null {
  if (!staffFlow) return null;
  if (!policyVerified) return 'policy_disabled';
  const time = typeof claims.auth_time === 'number' ? claims.auth_time * 1000 : NaN;
  if (!Number.isFinite(time) || time <= 0 || time > now + 60_000) return 'missing_auth_time';
  if (time < startedAt - 60_000) return 'stale_authentication';
  if (!Array.isArray(claims.amr) || !claims.amr.includes('mfa')) return 'missing_mfa_claim';
  return null;
}

/** Call only with claims whose signature, issuer, audience and nonce were verified. */
export function providerAssurance(
  claims: Record<string, unknown>,
  startedAt: number,
  staffFlow: boolean,
  policyVerified: boolean,
  now = Date.now(),
): AuthenticationAssurance {
  const time = typeof claims.auth_time === 'number' ? claims.auth_time * 1000 : NaN;
  const validTime = Number.isFinite(time) && time > 0 && time <= now + 60_000;
  return {
    authenticatedAt: validTime ? new Date(time).toISOString() : null,
    mfaVerified: assuranceFailure(claims, startedAt, staffFlow, policyVerified, now) === null && staffFlow,
  };
}

/** A non-sensitive reason that can be logged when a verified callback is denied. */
export function providerAssuranceFailure(
  claims: Record<string, unknown>,
  startedAt: number,
  staffFlow: boolean,
  policyVerified: boolean,
  now = Date.now(),
): AssuranceFailure | null {
  return assuranceFailure(claims, startedAt, staffFlow, policyVerified, now);
}
