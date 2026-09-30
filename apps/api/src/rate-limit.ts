import { createHash } from 'node:crypto';

import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { Redis } from 'ioredis';

// Atomic expiry prevents a failed connection from leaving an immortal key.
const COUNT_REQUEST = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
`;

/** Increments a fixed-window counter and returns the new count. Throws when
 * Redis is unavailable, slow, or answers nonsense — callers pick fail-open or
 * fail-closed. */
export async function countInWindow(redis: Redis, key: string, windowSec: number): Promise<number> {
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
    return count;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

const logger = new Logger('RateLimit');
const OUTAGE_LOG_INTERVAL_MS = 60_000;

/** IPv4-mapped IPv6 keys as its IPv4 address; other IPv6 keys by /64, since one host owns a whole /64
 * and could otherwise rotate addresses for unlimited buckets. */
export function clientKey(ip: string): string {
  const addr = (ip.split('%')[0] ?? ip).toLowerCase();
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(addr);
  if (dotted) return dotted[1]!;
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(addr);
  if (hex) {
    const [hi, lo] = [parseInt(hex[1]!, 16), parseInt(hex[2]!, 16)];
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  if (!addr.includes(':')) return addr;
  const [head = '', tail] = addr.split('::');
  const before = head ? head.split(':') : [];
  const after = tail ? tail.split(':') : [];
  const groups = tail === undefined ? before : [...before, ...Array<string>(Math.max(0, 8 - before.length - after.length)).fill('0'), ...after];
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

/** The analytics beacon fires on every navigation, so it gets its own bucket instead of the write quota. */
export function isEventsRequest(req: Pick<Request, 'originalUrl'>): boolean {
  return /^\/api\/v1\/events(?:[/?]|$)/.test(req.originalUrl);
}

/** Buckets on Express's verified `req.ip` (never cookies or client IP headers). `failOpen` is only for endpoints where an outage must not block users; writes stay fail-closed. */
export function writeRateLimit(redis: Redis | null, {
  limit, windowSec, namespace = 'write', includeReads = false, failOpen = false, skip,
}: { limit: number; windowSec: number; namespace?: string; includeReads?: boolean; failOpen?: boolean; skip?: (req: Request) => boolean }) {
  let lastOutageLog = 0;
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!redis || (!includeReads && ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) || skip?.(req)) return next();
    const who = createHash('sha256').update(clientKey(req.ip ?? req.socket?.remoteAddress ?? 'unknown')).digest('hex');
    const now = Math.floor(Date.now() / 1000);
    const retryAfter = windowSec - now % windowSec;
    const key = `rl:${namespace}:${who}:${Math.floor(now / windowSec)}`;
    try {
      const count = await countInWindow(redis, key, windowSec);
      if (count > limit) {
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({ statusCode: 429, message: 'Too many requests. Please try again later.' });
      }
    } catch {
      // Connection errors may contain credentials. Never echo or log them.
      if (failOpen) {
        if (Date.now() - lastOutageLog >= OUTAGE_LOG_INTERVAL_MS) {
          lastOutageLog = Date.now();
          logger.warn(`Rate limiter "${namespace}" unavailable; allowing requests`);
        }
        return next();
      }
      // Never turn an unavailable abuse-control dependency into unlimited public writes.
      res.setHeader('Retry-After', '5');
      return res.status(503).json({ statusCode: 503, message: 'Please try again shortly.' });
    }
    return next();
  };
}
