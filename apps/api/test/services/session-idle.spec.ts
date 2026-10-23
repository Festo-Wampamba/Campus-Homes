/**
 * 5-minute inactivity sign-out against the real docker test DB, with a fake
 * clock. Only POST /api/auth/activity (SessionStore.recordActivity) counts as
 * activity; every other authenticated request — including the background
 * polls (notification bell, chat messages/presence heartbeat, payment status,
 * landlord approval) — reads the session through AuthGuard and must not
 * extend it.
 */
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Pool } from 'pg';

import { IDLE_TIMEOUT_MS } from '@campushomes/shared';

import { RlsDb } from '../../src/db/db.module';
import { AuthGuard } from '../../src/modules/auth/auth.guard';
import { SESSION_COOKIE_NAME, SessionStore } from '../../src/modules/auth/session.store';
import { testDatabaseUrl } from '../test-database-url';

const pool = new Pool({ connectionString: testDatabaseUrl(), max: 5 });
const store = new SessionStore(new RlsDb(pool));
const guard = new AuthGuard(store);
const START = new Date('2026-10-22T08:00:00Z').getTime();
// The chat presence heartbeat interval: the most frequent "always on" poll.
const POLL_MS = 25_000;

let userId: string;

function requestWith(token: string): ExecutionContext {
  const req = { headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } };
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

function at(offsetMs: number) {
  jest.setSystemTime(START + offsetMs);
}

async function sessionRows(token: string): Promise<number> {
  return (await pool.query('SELECT 1 FROM sessions WHERE token = $1', [token])).rowCount ?? 0;
}

beforeAll(async () => {
  await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (logto_user_id, email, role, status, name)
     VALUES ('logto-idle', 'idle@example.test', 'student', 'active', 'Idle Student') RETURNING id`,
  );
  userId = rows[0]!.id;
});

beforeEach(() => {
  // Only Date is faked: pg's sockets still need real timers.
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'hrtime', 'performance'] });
  at(0);
});

afterEach(() => {
  jest.useRealTimers();
});

afterAll(async () => {
  await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');
  await pool.end();
});

describe('session inactivity timeout', () => {
  it('admits a request just inside the idle window', async () => {
    const { token } = await store.create(userId);
    at(IDLE_TIMEOUT_MS - 1_000);
    await expect(guard.canActivate(requestWith(token))).resolves.toBe(true);
  });

  it('rejects a request once the session has been idle for the full window', async () => {
    const { token } = await store.create(userId);
    at(IDLE_TIMEOUT_MS);
    await expect(guard.canActivate(requestWith(token))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('deletes the idle session row when it rejects it', async () => {
    const { token } = await store.create(userId);
    at(IDLE_TIMEOUT_MS + 1_000);
    await store.find(token);
    expect(await sessionRows(token)).toBe(0);
  });

  it('does not let background polling extend the session', async () => {
    const { token } = await store.create(userId);
    for (let elapsed = POLL_MS; elapsed < IDLE_TIMEOUT_MS; elapsed += POLL_MS) {
      at(elapsed);
      await guard.canActivate(requestWith(token));
    }
    at(IDLE_TIMEOUT_MS);
    await expect(guard.canActivate(requestWith(token))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('restarts the idle window on an explicit activity signal', async () => {
    const { token } = await store.create(userId);
    at(IDLE_TIMEOUT_MS - 1_000);
    await store.recordActivity(token);
    at(2 * IDLE_TIMEOUT_MS - 2_000);
    await expect(guard.canActivate(requestWith(token))).resolves.toBe(true);
  });

  it('refuses to revive a session that is already idle', async () => {
    const { token } = await store.create(userId);
    at(IDLE_TIMEOUT_MS);
    await expect(store.recordActivity(token)).resolves.toBe(false);
  });

  it('deletes an idle session when the activity signal arrives too late', async () => {
    const { token } = await store.create(userId);
    at(IDLE_TIMEOUT_MS);
    await store.recordActivity(token);
    expect(await sessionRows(token)).toBe(0);
  });
});
