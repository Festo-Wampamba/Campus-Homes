import { Global, Logger, Module } from '@nestjs/common';
import { Redis } from 'ioredis';

import { loadEnv, type Env } from '../config/env';

export const REDIS = 'REDIS_CONNECTION';
const logger = new Logger('RedisConnection');

export function runtimeRedisUrl(env: Env): string | undefined {
  return env.NODE_ENV === 'development' ? env.DEV_REDIS_URL : env.REDIS_URL;
}

function safeRedisHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'configured Redis host';
  }
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

        // Connect once during boot so a missing/unsafe queue backend fails
        // clearly before the HTTP server claims readiness. BullMQ requires
        // maxRetriesPerRequest=null for its blocking connections.
        const redis = new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: null,
          connectTimeout: 5_000,
        });
        try {
          await redis.connect();
          await redis.ping();
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
