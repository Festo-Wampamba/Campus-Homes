import type { Request, Response } from 'express';
import type { Redis } from 'ioredis';

import { writeRateLimit } from './rate-limit';

function fakeRedis(): Redis {
  const counts = new Map<string, number>();
  return {
    incr: async (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1).get(key),
    expire: async () => 1,
  } as unknown as Redis;
}

function post(ip: string): Request {
  return { method: 'POST', headers: { 'cf-connecting-ip': ip } } as unknown as Request;
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
});
