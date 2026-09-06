import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../../db/redis.module';
import { loadEnv } from '../../config/env';
import { digest, matchesSecret } from './auth-security';
import type { Portal } from './logto.config';

export const AUTH_TRANSACTION_TTL_SECONDS = 600;
export interface AuthTransaction {
  portal: Portal;
  next: string | null;
  nonce: string;
  browserHash: string;
  startedAt: number;
  expectedUserId: string | null;
  storage: Record<string, string>;
}

export function transactionCookie(state: string): string {
  return `campushomes-auth-${digest(state).slice(0, 24)}`;
}

/** Tokens/verifiers stay encrypted server-side; Redis atomically consumes each attempt. */
@Injectable()
export class AuthTransactions {
  constructor(@Inject(REDIS) private readonly redis: Redis | null) {}

  private settings() {
    const env = loadEnv();
    if (!this.redis || !env.LOGTO_COOKIE_SECRET) throw new ServiceUnavailableException('Authentication temporarily unavailable');
    return {
      redis: this.redis,
      key: createHash('sha256').update(env.LOGTO_COOKIE_SECRET).digest(),
      prefix: `campushomes:auth:${digest(env.WEB_ORIGIN)}:`,
    };
  }

  async save(state: string, transaction: AuthTransaction): Promise<void> {
    const { redis, key, prefix } = this.settings();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(state));
    const data = Buffer.concat([cipher.update(JSON.stringify(transaction), 'utf8'), cipher.final()]);
    const sealed = Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
    const result = await redis.set(prefix + digest(state), sealed, 'EX', AUTH_TRANSACTION_TTL_SECONDS, 'NX');
    if (result !== 'OK') throw new ServiceUnavailableException('Unable to start authentication');
  }

  async consume(state: string, browserSecret: string): Promise<AuthTransaction | null> {
    const { redis, key, prefix } = this.settings();
    const redisKey = prefix + digest(state);
    const sealed = await redis.get(redisKey);
    if (!sealed) return null;
    let transaction: AuthTransaction;
    try {
      const data = Buffer.from(sealed, 'base64');
      const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
      decipher.setAAD(Buffer.from(state));
      decipher.setAuthTag(data.subarray(12, 28));
      transaction = JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8')) as AuthTransaction;
    } catch {
      return null;
    }
    if (!matchesSecret(digest(browserSecret), transaction.browserHash)) return null;
    if (Date.now() - transaction.startedAt > AUTH_TRANSACTION_TTL_SECONDS * 1000 || transaction.startedAt > Date.now() + 60_000) return null;
    // A wrong browser must not consume somebody else's transaction. Compare the
    // exact encrypted value after validation so concurrent callbacks cannot win twice.
    const consumed = await redis.eval(
      "if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('DEL', KEYS[1]); return 1 else return 0 end",
      1, redisKey, sealed,
    );
    return consumed === 1 ? transaction : null;
  }
}
