import { Global, Logger, Module } from '@nestjs/common';
import { Redis } from 'ioredis';

import { loadEnv, type Env } from '../config/env';

export const REDIS = 'REDIS_CONNECTION';
const logger = new Logger('RedisConnection');

export function runtimeRedisUrl(env: Env): string | undefined {
  // An explicitly configured shared Redis service must win in every
  // environment. DEV_REDIS_URL is only a local-development fallback; using
  // it unconditionally when NODE_ENV=development makes containerized preview
  // environments silently connect to their own 127.0.0.1 instead.
  return env.REDIS_URL ?? (env.NODE_ENV === 'development' ? env.DEV_REDIS_URL : undefined);
}

function safeRedisHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'configured Redis host';
  }
}

/** A fresh container can race its overlay network/DNS for the first second
 * or two of life — retry with backoff before giving up, rather than crash
 * the whole app on a connection blip that clears itself moments later. */
export async function withRetry<T>(
  attempt: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number; delay?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const { maxAttempts = 5, baseDelayMs = 500, delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } =
    options;
  let lastError: unknown;
  for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber++) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
      if (attemptNumber < maxAttempts) {
        await delay(baseDelayMs * 2 ** (attemptNumber - 1));
      }
    }
  }
  throw lastError;
}

/** Shared ioredis connection (Upstash, TLS via rediss://). Null when
 * REDIS_URL is unset — dev convenience only; jobs and locks then no-op. */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: async (): Promise<Redis | null> => {
        const env = loadEnv();
        const redisUrl = runtimeRedisUrl(env);
        if (!redisUrl) {
          if (env.NODE_ENV === 'production') {
            throw new Error('REDIS_URL is required in production');
          }
          return null;
        }

        // Connect during boot so a missing/unsafe queue backend fails
        // clearly before the HTTP server claims readiness. BullMQ requires
        // maxRetriesPerRequest=null for its blocking connections.
        let redis: Redis;
        try {
          redis = await withRetry(async () => {
            const client = new Redis(redisUrl, {
              lazyConnect: true,
              maxRetriesPerRequest: null,
              connectTimeout: 5_000,
            });
            try {
              await client.connect();
              await client.ping();
              return client;
            } catch (error) {
              client.disconnect();
              throw error;
            }
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown Redis error';
          throw new Error(`Redis startup check failed: ${message}`);
        }
        try {
          const info = await redis.info('memory');
          const policy = info.match(/^maxmemory_policy:(.+)$/m)?.[1]?.trim();
          if (policy && policy !== 'noeviction') {
            throw new Error(
              `Redis at ${safeRedisHost(redisUrl)} uses maxmemory-policy=${policy}; BullMQ requires noeviction`,
            );
          }
          logger.log(`Connected to Redis at ${safeRedisHost(redisUrl)} with noeviction policy`);
          return redis;
        } catch (error) {
          redis.disconnect();
          const message = error instanceof Error ? error.message : 'unknown Redis error';
          throw new Error(`Redis startup check failed: ${message}`);
        }
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
