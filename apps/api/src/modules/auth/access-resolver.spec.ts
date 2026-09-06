import { accountAccess, normalizeAssurance } from './access-resolver';

const identity = { role: 'admin', hasStudent: false, hasLandlord: false, activeRoles: [], historicalRoles: [] };

describe('account access resolution', () => {
  it('does not infer any staff access from the legacy enum', () => {
    expect(accountAccess(identity).workspaces).toEqual([]);
    expect(accountAccess({ ...identity, role: 'ops_lead' }).roles).toEqual([]);
  });
  it('retains independent consumer profiles on a staff identity', () => {
    const access = accountAccess({ ...identity, hasStudent: true, hasLandlord: true, activeRoles: ['ops_lead'] });
    expect(access.workspaces).toEqual(['student', 'landlord', 'ops']);
    expect(access.onboarding).toEqual({ student: false, landlord: false });
  });
  it('does not restore a consumer role after revocation or expiry', () => {
    const access = accountAccess({ ...identity, role: 'landlord', hasLandlord: true, historicalRoles: ['landlord'] });
    expect(access.roles).toEqual([]);
  });
  it('marks granted consumer workspaces without profiles as needing onboarding', () => {
    expect(accountAccess({ ...identity, activeRoles: ['student', 'landlord'] }).onboarding)
      .toEqual({ student: true, landlord: true });
  });
  it('does not turn unknown role keys into an admin role', () => {
    expect(accountAccess({ ...identity, activeRoles: ['toString', 'custom_role'] }).workspaces).toEqual([]);
  });
  it('does not manufacture provider evidence', () => {
    expect(normalizeAssurance()).toEqual({ authenticatedAt: null, mfaVerified: false });
    expect(normalizeAssurance({ authenticatedAt: null, mfaVerified: true }).mfaVerified).toBe(false);
    expect(normalizeAssurance({ authenticatedAt: new Date(Date.now() + 60_000).toISOString(), mfaVerified: true }).mfaVerified).toBe(false);
  });
});
