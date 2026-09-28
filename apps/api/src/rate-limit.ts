import { createHash } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';
import type { Redis } from 'ioredis';

/**
 * Fixed-window limit on API writes, keyed by session cookie when present,
 * else client IP. Browser calls arrive through the Next proxy, so req.ip is
 * the web container; the edge-set headers carry the real client address.
 * Fails open: a Redis outage must not block every write.
 */
export function writeRateLimit(redis: Redis | null, { limit, windowSec }: { limit: number; windowSec: number }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!redis || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const session = /campushomes-session[^=]*=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
    const ip = header(req, 'cf-connecting-ip') ?? header(req, 'x-real-ip') ?? req.ip ?? 'unknown';
    const who = createHash('sha256').update(session ?? ip).digest('hex').slice(0, 32);
    const key = `rl:write:${who}:${Math.floor(Date.now() / 1000 / windowSec)}`;
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSec);
      if (count > limit) {
        res.setHeader('Retry-After', String(windowSec));
        return res.status(429).json({ statusCode: 429, message: 'Too many requests. Wait a minute and try again.' });
      }
    } catch (err) {
      console.error('[rate-limit] redis unavailable, allowing request:', err);
    }
    return next();
  };
}

function header(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}
