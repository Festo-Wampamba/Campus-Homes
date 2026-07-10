import { Global, Module } from '@nestjs/common';
import { Redis } from 'ioredis';

import { loadEnv } from '../config/env';

export const REDIS = 'REDIS_CONNECTION';

/** Shared ioredis connection (Upstash, TLS via rediss://). Null when
 * REDIS_URL is unset — dev convenience only; jobs and locks then no-op. */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: (): Redis | null => {
        const env = loadEnv();
        if (!env.REDIS_URL) {
          if (env.NODE_ENV === 'production') {
            throw new Error('REDIS_URL is required in production');
          }
          return null;
        }
        // maxRetriesPerRequest: null — BullMQ requirement for blocking commands.
        return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
