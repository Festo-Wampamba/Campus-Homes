import type { Env } from '../config/env';

import { runtimeRedisUrl, withRetry } from './redis.module';

function env(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: 'development',
    PORT: 4000,
    DEV_REDIS_URL: 'redis://localhost:6379',
    ALLOW_STUB_INTEGRATIONS: false,
    PAYMENTS_ENABLED: false,
    ...overrides,
  } as Env;
}

describe('withRetry', () => {
  it('returns the result once the attempt succeeds', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error('connect ECONNREFUSED 127.0.0.1:6379');
        return 'connected';
      },
      { delay: async () => {} },
    );
    expect(result).toBe('connected');
    expect(calls).toBe(3);
  });

  it('gives up and throws the last error after maxAttempts', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new Error(`attempt ${calls} failed`);
        },
        { maxAttempts: 3, delay: async () => {} },
      ),
    ).rejects.toThrow('attempt 3 failed');
    expect(calls).toBe(3);
  });

  it('waits with exponential backoff between attempts', async () => {
    const delays: number[] = [];
    let calls = 0;
    await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error('not ready yet');
        return 'ok';
      },
      {
        baseDelayMs: 100,
        delay: async (ms) => {
          delays.push(ms);
        },
      },
    );
    expect(delays).toEqual([100, 200]);
  });
});

describe('runtimeRedisUrl', () => {
  it('prefers an explicitly configured Redis service in development', () => {
    expect(
      runtimeRedisUrl(
        env({
          REDIS_URL: 'redis://redis-service:6379',
        }),
      ),
    ).toBe('redis://redis-service:6379');
  });

  it('uses the local development URL only when REDIS_URL is absent', () => {
    expect(runtimeRedisUrl(env())).toBe('redis://localhost:6379');
  });

  it('does not use the development fallback in production', () => {
    expect(runtimeRedisUrl(env({ NODE_ENV: 'production' }))).toBeUndefined();
  });
});
