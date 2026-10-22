import { randomBytes, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';

import { IDLE_TIMEOUT_MS, type AccountAccess, type AuthenticationAssurance, type UserRole, type UserStatus } from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { sessions, users } from '../../db/schema';
import { normalizeAssurance, resolveAccountAccess } from './access-resolver';
import { loadPermissions } from './permissions';

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
  access: AccountAccess;
  user: {
    id: string;
    role: UserRole;
    status: UserStatus;
    name: string;
    username: string | null;
    email: string | null;
    phone: string | null;
    contactPhone: string | null;
    gender: string | null;
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

  async create(userId: string, ipAddress?: string, userAgent?: string, assurance?: AuthenticationAssurance): Promise<{ token: string }> {
    const token = randomBytes(32).toString('hex');
    const now = new Date();
    const verified = normalizeAssurance(assurance);
    await this.rlsDb.run(SERVICE_CTX, (db) =>
      db.insert(sessions).values({
        id: randomUUID(),
        userId,
        token,
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
        ipAddress,
        userAgent,
        authenticatedAt: verified.authenticatedAt ? new Date(verified.authenticatedAt) : null,
        mfaVerified: verified.mfaVerified,
        // App clock, not the column's DB default, so idle checks compare like with like.
        lastActivityAt: now,
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
          authenticatedAt: sessions.authenticatedAt,
          mfaVerified: sessions.mfaVerified,
          lastActivityAt: sessions.lastActivityAt,
          userId: users.id,
          role: users.role,
          status: users.status,
          deletedAt: users.deletedAt,
          name: users.name,
          username: users.username,
          email: users.email,
          phone: users.phone,
          contactPhone: users.contactPhone,
          gender: users.gender,
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(eq(sessions.token, token)),
    );
    if (!row) return null;
    // Reading a session never counts as activity: background polls go through
    // here too, so only recordActivity() moves lastActivityAt.
    if (Date.now() - row.lastActivityAt.getTime() >= IDLE_TIMEOUT_MS) {
      await this.destroy(token);
      return null;
    }
    if (row.expiresAt.getTime() <= Date.now() || row.deletedAt || row.status !== 'active') return null;
    const access = await resolveAccountAccess(this.rlsDb, row.userId, {
      authenticatedAt: row.authenticatedAt?.toISOString() ?? null,
      mfaVerified: row.mfaVerified,
    });
    if (!access) return null;
    access.permissions = access.assurance.mfaVerified
      ? [...(await loadPermissions(this.rlsDb, row.userId)).permissions].sort() : [];
    return {
      access,
      user: { id: row.userId, role: row.role, status: row.status, name: row.name, username: row.username, email: row.email, phone: row.phone, contactPhone: row.contactPhone, gender: row.gender },
      session: {
        id: row.sessionId,
        createdAt: row.sessionCreatedAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      },
    };
  }

  /** The client's explicit "the user interacted" signal. Refuses (and deletes)
   * a session that is already idle or expired, so it can't be revived. */
  async recordActivity(token: string): Promise<boolean> {
    if (!token) return false;
    const now = new Date();
    const updated = await this.rlsDb.run(SERVICE_CTX, (db) =>
      db
        .update(sessions)
        .set({ lastActivityAt: now })
        .where(and(
          eq(sessions.token, token),
          gt(sessions.expiresAt, now),
          gt(sessions.lastActivityAt, new Date(now.getTime() - IDLE_TIMEOUT_MS)),
        ))
        .returning({ id: sessions.id }),
    );
    if (updated.length) return true;
    await this.destroy(token);
    return false;
  }

  async destroy(token: string): Promise<void> {
    if (!token) return;
    await this.rlsDb.run(SERVICE_CTX, (db) => db.delete(sessions).where(eq(sessions.token, token)));
  }
}
