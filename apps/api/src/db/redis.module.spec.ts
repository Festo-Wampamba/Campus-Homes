import { withRetry } from './redis.module';

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
