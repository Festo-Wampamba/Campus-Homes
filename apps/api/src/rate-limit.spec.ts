import type { Request, Response } from 'express';
import type { Redis } from 'ioredis';

import { writeRateLimit } from './rate-limit';

function fakeRedis(): Redis {
  const counts = new Map<string, number>();
  return {
    eval: jest.fn(async (_script: string, _keys: number, key: string) => counts.set(key, (counts.get(key) ?? 0) + 1).get(key)),
  } as unknown as Redis;
}

function post(ip: string): Request {
  return { method: 'POST', ip, headers: {} } as unknown as Request;
}

function run(limiter: ReturnType<typeof writeRateLimit>, req: Request) {
  let status = 200;
  const res = { setHeader: () => res, status: (code: number) => ((status = code), res), json: () => res } as unknown as Response;
  return limiter(req, res, () => undefined).then(() => status);
}

describe('writeRateLimit', () => {
  it('returns 429 once a client exceeds the window limit', async () => {
    const limiter = writeRateLimit(fakeRedis(), { limit: 2, windowSec: 60 });
    const statuses = [await run(limiter, post('1.1.1.1')), await run(limiter, post('1.1.1.1')), await run(limiter, post('1.1.1.1'))];
    expect(statuses).toEqual([200, 200, 429]);
  });

  it('counts each client separately', async () => {
    const limiter = writeRateLimit(fakeRedis(), { limit: 1, windowSec: 60 });
    await run(limiter, post('1.1.1.1'));
    expect(await run(limiter, post('2.2.2.2'))).toBe(200);
  });

  it('does not let spoofed IP headers or fake session cookies reset the quota', async () => {
    const limiter = writeRateLimit(fakeRedis(), { limit: 1, windowSec: 60 });
    await run(limiter, post('1.1.1.1'));
    for (const headers of [
      { cookie: 'campushomes-session-v1=fake-session' },
      { cookie: 'campushomes-session-attacker=another-session' },
      { 'cf-connecting-ip': '2.2.2.2', 'x-real-ip': '3.3.3.3', 'x-forwarded-for': '4.4.4.4' },
    ]) {
      const req = post('1.1.1.1');
      req.headers = headers;
      expect(await run(limiter, req)).toBe(429);
    }
  });

  it('uses atomic expiry for concurrent requests', async () => {
    const redis = fakeRedis();
    const limiter = writeRateLimit(redis, { limit: 1, windowSec: 60 });
    expect(await Promise.all([run(limiter, post('1.1.1.1')), run(limiter, post('1.1.1.1'))])).toEqual([200, 429]);
    expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('EXPIRE'"), 1, expect.stringContaining('rl:write:'), 60);
  });

  it('fails closed on Redis errors and avoids queueing while disconnected', async () => {
    const redis = { eval: jest.fn().mockRejectedValue(new Error('secret connection URL')) } as unknown as Redis;
    expect(await run(writeRateLimit(redis, { limit: 1, windowSec: 60 }), post('1.1.1.1'))).toBe(503);
    const offline = { status: 'reconnecting', eval: jest.fn() } as unknown as Redis;
    expect(await run(writeRateLimit(offline, { limit: 1, windowSec: 60 }), post('1.1.1.1'))).toBe(503);
    expect(offline.eval).not.toHaveBeenCalled();
  });

  it('preserves reads and null-Redis local mode, with explicit auth GET quotas', async () => {
    expect(await run(writeRateLimit(null, { limit: 1, windowSec: 60 }), post('1.1.1.1'))).toBe(200);
    const redis = fakeRedis();
    const req = post('1.1.1.1');
    req.method = 'GET';
    await run(writeRateLimit(redis, { limit: 1, windowSec: 60 }), req);
    expect(redis.eval).not.toHaveBeenCalled();
    const limiter = writeRateLimit(redis, { limit: 1, windowSec: 60, namespace: 'sign-in', includeReads: true });
    expect(await run(limiter, req)).toBe(200);
    expect(await run(limiter, req)).toBe(429);
  });
});
