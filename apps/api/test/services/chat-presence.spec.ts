/**
 * WhatsApp-style receipts and presence: heartbeat delivers (✓ → ✓✓), read
 * implies delivered, online / last seen / typing for thread participants only.
 */
import { ForbiddenException } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { Pool } from 'pg';

import { NoopRealtime } from '../../src/adapters/realtime.adapter';
import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import { ChatService } from '../../src/modules/chat/chat.service';
import { PresenceService } from '../../src/modules/presence/presence.service';
import { testDatabaseUrl } from '../test-database-url';

/** In-memory stand-in for the few Redis calls presence makes (TTL not simulated). */
function fakeRedis() {
  const store = new Map<string, string>();
  return {
    async set(key: string, value: string, ...args: unknown[]) {
      if (args.includes('NX') && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    },
    async del(key: string) {
      return store.delete(key) ? 1 : 0;
    },
    async mget(keys: string[]) {
      return keys.map((k) => store.get(k) ?? null);
    },
    async exists(key: string) {
      return store.has(key) ? 1 : 0;
    },
  } as unknown as Redis;
}

const pool = new Pool({ connectionString: testDatabaseUrl(), max: 5 });
const rlsDb = new RlsDb(pool);

let presence: PresenceService;
let chat: ChatService;
let student: string;
let landlord: string;
let outsider: string;
let threadId: string;

const ctx = (userId: string, role: RlsContext['role']): RlsContext => ({ userId, role });

async function insertMessage(fromUserId: string, body = 'Hello'): Promise<string> {
  const res = await pool.query(
    `INSERT INTO chat_messages (thread_id, from_user_id, body) VALUES ($1, $2, $3) RETURNING id`,
    [threadId, fromUserId, body],
  );
  return res.rows[0].id as string;
}

async function messageRow(id: string) {
  return (await pool.query(`SELECT delivered_at, read_at FROM chat_messages WHERE id = $1`, [id])).rows[0];
}

beforeAll(async () => {
  await pool.query(`TRUNCATE users, students, landlords, chat_threads, chat_messages CASCADE`);
  const user = async (phone: string, role: string) =>
    (await pool.query(`INSERT INTO users (phone, role, status) VALUES ($1, $2, 'active') RETURNING id`, [phone, role]))
      .rows[0].id as string;
  student = await user('+256710000301', 'student');
  landlord = await user('+256710000302', 'landlord');
  outsider = await user('+256710000303', 'student');
  await pool.query(`INSERT INTO students (user_id, university) VALUES ($1, 'MUK'), ($2, 'MUK')`, [student, outsider]);
  await pool.query(`INSERT INTO landlords (user_id, legal_name, kyc_status) VALUES ($1, 'Test Landlord', 'verified')`, [landlord]);
  threadId = (
    await pool.query(`INSERT INTO chat_threads (student_id, landlord_id) VALUES ($1, $2) RETURNING id`, [student, landlord])
  ).rows[0].id as string;
});

beforeEach(async () => {
  await pool.query(`DELETE FROM chat_messages`);
  await pool.query(`UPDATE users SET last_seen_at = NULL`);
  presence = new PresenceService(rlsDb, fakeRedis());
  chat = new ChatService(rlsDb, new NoopRealtime(), undefined, presence);
});

afterAll(async () => {
  await pool.query(`TRUNCATE users CASCADE`);
  await pool.end();
});

describe('PresenceService.heartbeat', () => {
  it('marks messages sent to the user as delivered', async () => {
    const id = await insertMessage(landlord);

    await presence.heartbeat(student);

    expect((await messageRow(id)).delivered_at).not.toBeNull();
  });

  it("leaves the user's own messages for the other person to receive", async () => {
    const id = await insertMessage(student);

    await presence.heartbeat(student);

    expect((await messageRow(id)).delivered_at).toBeNull();
  });

  it('records when the user was last seen', async () => {
    await presence.heartbeat(student);

    const row = (await pool.query(`SELECT last_seen_at FROM users WHERE id = $1`, [student])).rows[0];
    expect(row.last_seen_at).not.toBeNull();
  });

  it('shows the user as online', async () => {
    await presence.heartbeat(student);

    expect(await presence.isOnline(student)).toBe(true);
  });
});

it('shows the user offline after they leave', async () => {
  await presence.heartbeat(student);

  await presence.away(student);

  expect(await presence.isOnline(student)).toBe(false);
});

it('refuses typing pings from someone outside the conversation', async () => {
  await expect(presence.typing(outsider, threadId)).rejects.toBeInstanceOf(ForbiddenException);
});

describe('ChatService presence', () => {
  it('tells the student the landlord is typing', async () => {
    await presence.typing(landlord, threadId);

    expect((await chat.threadPresence(ctx(student, 'student'), threadId)).typing).toBe(true);
  });

  it('does not reveal presence to someone outside the conversation', async () => {
    await expect(chat.threadPresence(ctx(outsider, 'student'), threadId)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('counts a read message as delivered too', async () => {
    const id = await insertMessage(landlord);

    await chat.markRead(ctx(student, 'student'), threadId);

    expect((await messageRow(id)).delivered_at).not.toBeNull();
  });

  it('delivers a message at once when the recipient is online', async () => {
    await presence.heartbeat(landlord);

    const sent = await chat.sendMessage(ctx(student, 'student'), threadId, 'Is the room free?');

    expect((await messageRow(sent.id)).delivered_at).not.toBeNull();
  });

  it('leaves a message to an offline recipient on one tick', async () => {
    const sent = await chat.sendMessage(ctx(student, 'student'), threadId, 'Is the room free?');

    expect((await messageRow(sent.id)).delivered_at).toBeNull();
  });

  it('shows in the conversation list that the landlord is online', async () => {
    await presence.heartbeat(landlord);

    const [thread] = await chat.myThreads(ctx(student, 'student'));
    expect(thread?.counterpartOnline).toBe(true);
  });
});
