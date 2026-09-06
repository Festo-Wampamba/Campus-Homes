import type { Redis } from 'ioredis';
import { AuthTransactions, type AuthTransaction, transactionCookie } from './auth-transactions';
import { digest } from './auth-security';

describe('single-use authentication transactions', () => {
  const initialEnv = { ...process.env };
  const values = new Map<string, string>();
  const redis = {
    set: jest.fn(async (key: string, value: string) => {
      if (values.has(key)) return null;
      values.set(key, value);
      return 'OK';
    }),
    get: jest.fn(async (key: string) => values.get(key) ?? null),
    eval: jest.fn(async (_script: string, _count: number, key: string, value: string) => {
      if (values.get(key) !== value) return 0;
      values.delete(key);
      return 1;
    }),
  };
  let store: AuthTransactions;
  function transaction(): AuthTransaction {
    return { portal: 'consumer', next: '/landlord', nonce: 'nonce', browserHash: digest('browser'),
      startedAt: Date.now(), expectedUserId: null, storage: { signInSession: 'private-pkce-verifier' } };
  }
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://unused/isolated';
    process.env.LOGTO_COOKIE_SECRET = 'unit-test-only-secret-at-least-32-characters';
    process.env.WEB_ORIGIN = 'https://staging.example.invalid';
    values.clear();
    jest.clearAllMocks();
    store = new AuthTransactions(redis as unknown as Redis);
  });
  afterAll(() => { process.env = initialEnv; });
  it('encrypts sensitive data and applies a ten-minute TTL', async () => {
    await store.save('state', transaction());
    expect([...values.values()][0]).not.toContain('private-pkce-verifier');
    expect(redis.set).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'EX', 600, 'NX');
  });
  it('keeps two overlapping attempts independent', async () => {
    await store.save('first', transaction());
    await store.save('second', { ...transaction(), portal: 'staff', next: '/ops' });
    expect(transactionCookie('first')).not.toBe(transactionCookie('second'));
    expect((await store.consume('first', 'browser'))?.portal).toBe('consumer');
    expect((await store.consume('second', 'browser'))?.next).toBe('/ops');
  });
  it('rejects a wrong browser without destroying the legitimate attempt', async () => {
    await store.save('state', transaction());
    expect(await store.consume('state', 'wrong')).toBeNull();
    expect(await store.consume('state', 'browser')).not.toBeNull();
  });
  it('allows only one concurrent consumer', async () => {
    await store.save('state', transaction());
    const results = await Promise.all([store.consume('state', 'browser'), store.consume('state', 'browser')]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await store.consume('state', 'browser')).toBeNull();
  });
  it('rejects expired and tampered transactions', async () => {
    await store.save('state', { ...transaction(), startedAt: Date.now() - 601_000 });
    expect(await store.consume('state', 'browser')).toBeNull();
    for (const key of values.keys()) values.set(key, 'tampered');
    expect(await store.consume('state', 'browser')).toBeNull();
  });
  it('fails closed when persistent storage is unavailable', async () => {
    await expect(new AuthTransactions(null).save('state', transaction())).rejects.toThrow('temporarily unavailable');
  });
});
