import type { RlsDb } from '../../db/db.module';
import { SessionStore } from './session.store';

const assuranceTime = new Date('2026-01-01T00:00:00Z');
function database(overrides: Record<string, unknown> = {}) {
  const row = {
    sessionId: 'session', sessionCreatedAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
    authenticatedAt: assuranceTime, mfaVerified: true,
    userId: 'user', role: 'admin', status: 'active', deletedAt: null,
    name: 'Test', email: null, phone: null, ...overrides,
  };
  const values = jest.fn().mockResolvedValue(undefined);
  const query = { select: () => query, from: () => query, innerJoin: () => query,
    where: jest.fn().mockResolvedValue([row]), insert: () => ({ values }) };
  const client = { query: jest.fn().mockResolvedValue({ rows: [{
    role: 'admin', hasStudent: true, hasLandlord: true,
    activeRoles: ['ops_lead'], historicalRoles: ['ops_lead'],
  }] }) };
  const rlsDb = { run: (_ctx: unknown, fn: (db: unknown, client: unknown) => unknown) => fn(query, client) } as unknown as RlsDb;
  return { store: new SessionStore(rlsDb), values, client };
}

describe('SessionStore assurance and lifetime', () => {
  it('persists provider assurance separately from application session time', async () => {
    const { store, values } = database();
    await store.create('user', 'ip', 'ua', { authenticatedAt: assuranceTime.toISOString(), mfaVerified: true });
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      authenticatedAt: assuranceTime, mfaVerified: true, userId: 'user', ipAddress: 'ip', userAgent: 'ua',
    }));
  });
  it('defaults new sessions to no provider assurance', async () => {
    const { store, values } = database();
    await store.create('user');
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ authenticatedAt: null, mfaVerified: false }));
  });
  it('returns current access with the persisted provider timestamp', async () => {
    const { store, client } = database();
    const result = await store.find('token');
    expect(result?.access.workspaces).toEqual(['student', 'landlord', 'ops']);
    expect(result?.access.assurance).toEqual({ authenticatedAt: assuranceTime.toISOString(), mfaVerified: true });
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('a.revoked_at IS NULL'), ['user']);
  });
  it.each([
    { expiresAt: new Date(0) }, { deletedAt: new Date() }, { status: 'suspended' },
  ])('rejects expired/deleted/inactive identities before resolving access: %j', async (override) => {
    const { store, client } = database(override);
    await expect(store.find('token')).resolves.toBeNull();
    expect(client.query).not.toHaveBeenCalled();
  });
  it('never upgrades a pre-migration session to MFA', async () => {
    const { store } = database({ authenticatedAt: null, mfaVerified: false });
    expect((await store.find('token'))?.access.assurance).toEqual({ authenticatedAt: null, mfaVerified: false });
  });
  it('fails closed if the identity is deleted between session and access reads', async () => {
    const { store, client } = database();
    client.query.mockResolvedValue({ rows: [] });
    await expect(store.find('token')).resolves.toBeNull();
  });
});
