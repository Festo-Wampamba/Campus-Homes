import { safeAuthDestination } from '@campushomes/shared';
import { matchesSecret, providerAssurance, providerAssuranceFailure, redactSecrets } from './auth-security';

describe('authentication security boundaries', () => {
  it('strips embedded credentials from a connection-string error message', () => {
    const userinfo = ['default', 'fake-test-credential-not-real'].join(':');
    const withCreds = `connect ECONNREFUSED redis:${'//'}${userinfo}@redis:6379`;
    expect(redactSecrets(withCreds)).toBe(`connect ECONNREFUSED redis:${'//'}***@redis:6379`);
    expect(redactSecrets('duplicate key value violates unique constraint "users_phone_unique"'))
      .toBe('duplicate key value violates unique constraint "users_phone_unique"');
  });
  it.each(['https://evil.invalid', '//evil.invalid', '/\\evil.invalid', '/%5cevil.invalid', '/%2fevil.invalid', '/\n/evil.invalid', '/%00', '/%zz'])('rejects ambiguous destination %s', (value) => {
    expect(safeAuthDestination(value)).toBeNull();
  });
  it('normalizes a same-origin destination', () => {
    expect(safeAuthDestination('/landlord/../ops?view=mine')).toBe('/ops?view=mine');
  });
  it('compares secrets without length-dependent buffer errors', () => {
    expect(matchesSecret('a', 'a')).toBe(true);
    expect(matchesSecret('', 'secret')).toBe(false);
  });
  const now = 1_800_000_000_000;
  it('requires verified fresh provider MFA, staff flow, and rollout approval', () => {
    const claims = { auth_time: now / 1000, acr: 'urn:logto:acr:mfa', amr: ['pwd', 'mfa'] };
    expect(providerAssurance(claims, now, true, true, now).mfaVerified).toBe(true);
    expect(providerAssuranceFailure(claims, now, true, true, now)).toBeNull();
    expect(providerAssurance(claims, now, false, true, now).mfaVerified).toBe(false);
    expect(providerAssurance(claims, now, true, false, now).mfaVerified).toBe(true);
  });
  it('reports a safe, actionable denial reason', () => {
    expect(providerAssuranceFailure({ amr: ['pwd', 'mfa'] }, now, true, true, now)).toBe('missing_auth_time');
    expect(providerAssuranceFailure({ auth_time: (now - 120_000) / 1000, acr: 'urn:logto:acr:mfa', amr: ['pwd', 'mfa'] }, now, true, true, now))
      .toBe('stale_authentication');
    // Fresh auth, no signed MFA proof, and no operator assertion → denied.
    expect(providerAssuranceFailure({ auth_time: now / 1000, acr: 'urn:logto:acr:1fa', amr: ['pwd', 'otp'] }, now, true, false, now))
      .toBe('missing_mfa_claim');
  });
  it('accepts fresh staff auth under operator-asserted mandatory MFA when Logto omits acr/amr', () => {
    // Released Logto (<= v1.43) emits neither acr nor amr; MFA is guaranteed by
    // Logto's mandatory-MFA policy, asserted via LOGTO_MFA_POLICY_VERIFIED.
    const claims = { auth_time: now / 1000 };
    expect(providerAssurance(claims, now, true, true, now).mfaVerified).toBe(true);
    expect(providerAssuranceFailure(claims, now, true, true, now)).toBeNull();
    // Without the operator assertion, absent proof is still denied.
    expect(providerAssuranceFailure(claims, now, true, false, now)).toBe('missing_mfa_claim');
    // A stale authentication is denied even under the operator assertion.
    expect(providerAssuranceFailure({ auth_time: (now - 120_000) / 1000 }, now, true, true, now))
      .toBe('stale_authentication');
  });
  it.each([
    {}, { amr: ['mfa'] }, { auth_time: now / 1000, mfaEnrolled: true },
    { auth_time: (now - 120_000) / 1000, amr: ['mfa'] },
    { auth_time: (now + 120_000) / 1000, amr: ['mfa'] },
  ])('does not invent assurance from absent, stale or invalid evidence without the operator assertion', (claims) => {
    expect(providerAssurance(claims, now, true, false, now).mfaVerified).toBe(false);
  });
});
