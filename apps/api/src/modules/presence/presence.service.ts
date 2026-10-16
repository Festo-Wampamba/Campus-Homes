import { ForbiddenException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { RlsDb } from '../../db/db.module';
import { REDIS } from '../../db/redis.module';

// A visible tab beats every 25 s; 60 s of silence means the user left.
const ONLINE_TTL_SEC = 60;
// users.last_seen_at is written at most this often per user.
const SEEN_WRITE_EVERY_SEC = 60;
// "typing…" clears this long after the last keystroke ping.
const TYPING_TTL_SEC = 6;

const onlineKey = (userId: string) => `presence:online:${userId}`;
const seenKey = (userId: string) => `presence:seen:${userId}`;
const typingKey = (threadId: string, userId: string) => `presence:typing:${threadId}:${userId}`;

const service = (userId: string) => ({ userId, role: 'service_role' as const });

/**
 * Online / last seen / typing for chat. Redis holds the short-lived state;
 * Postgres holds last_seen_at and delivered_at so they survive a Redis
 * restart. Without Redis (local dev) nobody shows online, everything else works.
 */
@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  constructor(
    private readonly rlsDb: RlsDb,
    @Optional() @Inject(REDIS) private readonly redis: Redis | null = null,
  ) {}

  /** A visible CampusHomes tab checking in: online, last seen, delivered ticks. */
  async heartbeat(userId: string): Promise<void> {
    const persistSeen = await this.markOnline(userId);
    await this.rlsDb.run(service(userId), async (_db, client) => {
      if (persistSeen) await client.query(`UPDATE users SET last_seen_at = now() WHERE id = $1`, [userId]);
      // Everything sent to this user so far has now reached a device: ✓ → ✓✓.
      await client.query(
        `UPDATE chat_messages m SET delivered_at = now()
         FROM chat_threads t
         WHERE m.thread_id = t.id AND m.delivered_at IS NULL
           AND m.from_user_id <> $1 AND (t.student_id = $1 OR t.landlord_id = $1)`,
        [userId],
      );
    });
  }

  /** The last tab was hidden or closed: offline now, last seen = now. */
  async away(userId: string): Promise<void> {
    await this.safely(() => this.redis?.del(onlineKey(userId)));
    await this.rlsDb.run(service(userId), (_db, client) =>
      client.query(`UPDATE users SET last_seen_at = now() WHERE id = $1`, [userId]),
    );
  }

  /** Called every few seconds while the user types in a thread they belong to. */
  async typing(userId: string, threadId: string): Promise<void> {
    await this.assertParticipant(userId, threadId);
    await this.safely(() => this.redis?.set(typingKey(threadId, userId), '1', 'EX', TYPING_TTL_SEC));
  }

  async isOnline(userId: string): Promise<boolean> {
    return (await this.onlineSet([userId])).has(userId);
  }

  async onlineSet(userIds: string[]): Promise<Set<string>> {
    if (!this.redis || userIds.length === 0) return new Set();
    const values = await this.safely(() => this.redis!.mget(userIds.map(onlineKey)));
    return new Set(userIds.filter((_, i) => values?.[i]));
  }

  async isTyping(threadId: string, userId: string): Promise<boolean> {
    return Boolean(await this.safely(() => this.redis?.exists(typingKey(threadId, userId))));
  }

  async assertParticipant(userId: string, threadId: string): Promise<void> {
    const found = await this.rlsDb.run(service(userId), (_db, client) =>
      client.query(`SELECT 1 FROM chat_threads WHERE id = $1 AND (student_id = $2 OR landlord_id = $2)`, [
        threadId,
        userId,
      ]),
    );
    if (!found.rowCount) throw new ForbiddenException('Not a participant');
  }

  /** Marks online; true when last_seen_at is due for a DB write. */
  private async markOnline(userId: string): Promise<boolean> {
    if (!this.redis) return true;
    const result = await this.safely(async () => {
      await this.redis!.set(onlineKey(userId), '1', 'EX', ONLINE_TTL_SEC);
      return this.redis!.set(seenKey(userId), '1', 'EX', SEEN_WRITE_EVERY_SEC, 'NX');
    });
    // Redis down: persist every time rather than lose "last seen".
    return result === undefined || result === 'OK';
  }

  // Presence is best-effort: a Redis hiccup must never fail a chat request.
  private async safely<T>(fn: () => Promise<T> | undefined): Promise<T | undefined> {
    try {
      return await fn();
    } catch (err) {
      this.logger.warn(`Presence Redis call failed: ${err instanceof Error ? err.message : 'unknown'}`);
      return undefined;
    }
  }
}
