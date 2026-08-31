import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import { RlsDb } from '../../db/db.module';
import type { Db } from '../../db/client';
import type { RlsContext } from '../../db/rls-context';
import { users } from '../../db/schema';
import type { Portal } from './logto.config';

const SERVICE_CTX: RlsContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'service_role',
};

export interface LogtoIdentityClaims {
  sub: string;
  email?: string | null;
  phoneNumber?: string | null;
  name?: string | null;
}

export interface ProvisionedUser {
  id: string;
  role: string;
  status: string;
}

/**
 * Finds or creates the local `users` row for a verified Logto identity.
 * Called inline, synchronously, in the callback handler — before
 * authorizing. Logto webhooks are async and cannot gate the current
 * sign-in's authorization decision, so provisioning must never be deferred
 * to one.
 */
@Injectable()
export class ProvisioningService {
  constructor(private readonly rlsDb: RlsDb) {}

  async provision(claims: LogtoIdentityClaims, portal: Portal): Promise<ProvisionedUser | null> {
    return this.rlsDb.run(SERVICE_CTX, async (db) => {
      const linked = await this.byLogtoId(db, claims.sub);
      if (linked) return linked;

      // First-ever sign-in for this Logto identity — try to link an
      // existing (pre-migration or admin-provisioned) unlinked local user
      // by phone or email. Verified-subject linking (never re-derived from
      // email after this point): once `logtoUserId` is set, every future
      // sign-in for this person takes the fast path above and never
      // re-matches by email again.
      const candidate = await this.findUnlinkedCandidate(db, claims);
      if (candidate) {
        const [row] = await db
          .update(users)
          .set({ logtoUserId: claims.sub })
          .where(eq(users.id, candidate.id))
          .returning({ id: users.id, role: users.role, status: users.status });
        return row ?? null;
      }

      if (portal === 'staff') {
        // Staff is invite-only. No matching pre-provisioned user means this
        // identity was never invited — refuse rather than auto-create.
        return null;
      }

      try {
        const [created] = await db
          .insert(users)
          .values({
            id: randomUUID(),
            logtoUserId: claims.sub,
            phone: claims.phoneNumber ?? null,
            email: claims.email ?? null,
            name: claims.name ?? '',
            role: 'student',
            status: 'active',
            phoneVerified: Boolean(claims.phoneNumber),
            emailVerified: Boolean(claims.email),
          })
          .returning({ id: users.id, role: users.role, status: users.status });
        return created ?? null;
      } catch (err) {
        // Double-click/two-tab race: a concurrent callback for the same
        // never-seen sub won the unique constraint on logto_user_id first —
        // recoverable, re-read and link normally. A phone/email unique
        // violation is a different, non-recoverable situation (that
        // identifier already belongs to a different, already-linked user)
        // and must NOT attempt a read-back: the transaction is aborted at
        // this point, and any query on it errors until rolled back — let it
        // propagate so withRlsContext rolls back and the caller sees it.
        if (isUniqueViolationOn(err, 'users_logto_user_id_key')) {
          return this.byLogtoId(db, claims.sub);
        }
        throw err;
      }
    });
  }

  private async byLogtoId(db: Db, sub: string): Promise<ProvisionedUser | null> {
    const [row] = await db
      .select({ id: users.id, role: users.role, status: users.status })
      .from(users)
      .where(eq(users.logtoUserId, sub));
    return row ?? null;
  }

  private async findUnlinkedCandidate(
    db: Db,
    claims: LogtoIdentityClaims,
  ): Promise<{ id: string } | null> {
    if (claims.phoneNumber) {
      const [byPhone] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.phone, claims.phoneNumber), isNull(users.logtoUserId)));
      if (byPhone) return byPhone;
    }
    if (claims.email) {
      const [byEmail] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, claims.email), isNull(users.logtoUserId)));
      if (byEmail) return byEmail;
    }
    return null;
  }
}

function isUniqueViolationOn(err: unknown, constraint: string): boolean {
  if (typeof err !== 'object' || err === null || !('cause' in err)) return false;
  const cause = (err as { cause?: { code?: unknown; constraint?: unknown } }).cause;
  return typeof cause === 'object' && cause?.code === '23505' && cause.constraint === constraint;
}
