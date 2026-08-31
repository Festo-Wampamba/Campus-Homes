import { randomBytes, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { UserRole, UserStatus } from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { sessions, users } from '../../db/schema';

const SERVICE_CTX: RlsContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'service_role',
};

// Matches Better Auth's pinned policy this replaces: a 7-day session.
const SESSION_TTL_MS = 60 * 60 * 24 * 7 * 1000;

// Versioned so a stale host-only cookie from before this migration can
// never shadow a real session — same rationale as Better Auth's own
// `cookiePrefix: 'campushomes-auth-v2'` it replaces.
export const SESSION_COOKIE_NAME = 'campushomes-session-v1';

export interface SessionData {
  user: {
    id: string;
    role: UserRole;
    status: UserStatus;
    name: string;
    email: string | null;
    phone: string | null;
  };
  session: {
    id: string;
    createdAt: string;
    expiresAt: string;
  };
}

/** Owns the app's own session cookie/table — the thing the browser actually
 * receives. Logto's tokens never reach the browser (BFF). */
@Injectable()
export class SessionStore {
  constructor(private readonly rlsDb: RlsDb) {}

  async create(userId: string, ipAddress?: string, userAgent?: string): Promise<{ token: string }> {
    const token = randomBytes(32).toString('hex');
    const now = new Date();
    await this.rlsDb.run(SERVICE_CTX, (db) =>
      db.insert(sessions).values({
        id: randomUUID(),
        userId,
        token,
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
        ipAddress,
        userAgent,
      }),
    );
    return { token };
  }

  async find(token: string): Promise<SessionData | null> {
    if (!token) return null;
    const [row] = await this.rlsDb.run(SERVICE_CTX, (db) =>
      db
        .select({
          sessionId: sessions.id,
          sessionCreatedAt: sessions.createdAt,
          expiresAt: sessions.expiresAt,
          userId: users.id,
          role: users.role,
          status: users.status,
          name: users.name,
          email: users.email,
          phone: users.phone,
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(eq(sessions.token, token)),
    );
    if (!row || row.expiresAt.getTime() < Date.now()) return null;
    return {
      user: { id: row.userId, role: row.role, status: row.status, name: row.name, email: row.email, phone: row.phone },
      session: {
        id: row.sessionId,
        createdAt: row.sessionCreatedAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      },
    };
  }

  async destroy(token: string): Promise<void> {
    if (!token) return;
    await this.rlsDb.run(SERVICE_CTX, (db) => db.delete(sessions).where(eq(sessions.token, token)));
  }
}
