import { createHash } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';
import type { Redis } from 'ioredis';

// Atomic expiry prevents a failed connection from leaving an immortal key.
const COUNT_REQUEST = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
`;

/** Use Express's verified proxy chain, never unverified cookies or IP headers. */
export function writeRateLimit(redis: Redis | null, {
  limit, windowSec, namespace = 'write', includeReads = false,
}: { limit: number; windowSec: number; namespace?: string; includeReads?: boolean }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!redis || (!includeReads && ['GET', 'HEAD', 'OPTIONS'].includes(req.method))) return next();
    const who = createHash('sha256').update(req.ip ?? req.socket?.remoteAddress ?? 'unknown').digest('hex');
    const now = Math.floor(Date.now() / 1000);
    const retryAfter = windowSec - now % windowSec;
    const key = `rl:${namespace}:${who}:${Math.floor(now / windowSec)}`;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      // The queue connection retries indefinitely. HTTP requests must fail
      // promptly instead of accumulating commands during a Redis outage.
      if (redis.status && redis.status !== 'ready') throw new Error('Redis unavailable');
      const count = await Promise.race([
        redis.eval(COUNT_REQUEST, 1, key, windowSec),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('Rate limit timeout')), 1500);
        }),
      ]);
      if (typeof count !== 'number' || !Number.isFinite(count)) throw new Error('Invalid rate limit count');
      if (count > limit) {
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({ statusCode: 429, message: 'Too many requests. Please try again later.' });
      }
    } catch {
      // Connection errors may contain credentials. Never echo them or turn
      // an unavailable abuse-control dependency into unlimited public writes.
      res.setHeader('Retry-After', '5');
      return res.status(503).json({ statusCode: 503, message: 'Please try again shortly.' });
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    return next();
  };
}
