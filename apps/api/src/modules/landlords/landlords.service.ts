import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import type { UpsertLandlordProfileInput } from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { landlords, users } from '../../db/schema';

@Injectable()
export class LandlordsService {
  constructor(private readonly rlsDb: RlsDb) {}

  // Closes the self-serve gap: phone-OTP signup always defaults role
  // 'student' (auth.config.ts, input: false) and landlords_self_insert
  // requires app_role() = 'landlord' already, so nothing else can ever make
  // this row's owner a landlord. Runs as service_role (svc_all covers the
  // users write); scoped tightly to student->landlord and nothing else, so
  // the users table's "no self-UPDATE" invariant still holds for every other
  // field. Once role flips, the existing landlord-only routes (me/profile)
  // work on the caller's very next request — getServerSession() re-reads the
  // user row live, no session caching to invalidate.
  apply(ctx: RlsContext) {
    return this.rlsDb.run({ userId: ctx.userId, role: 'service_role' }, async (db, client) => {
      const open = (await client.query<{ enabled: boolean }>(`
        SELECT coalesce((value #>> '{}')::boolean, true) AS enabled
        FROM platform_settings WHERE key = 'registrations_open'
      `)).rows[0]?.enabled ?? true;
      if (!open) throw new ForbiddenException('New landlord registrations are temporarily closed');
      const [row] = await db
        .update(users)
        .set({ role: 'landlord' })
        .where(and(eq(users.id, ctx.userId), eq(users.role, 'student')))
        .returning({ id: users.id, role: users.role });
      if (!row) {
        throw new ConflictException('Only student accounts can apply to become a landlord');
      }
      return row;
    });
  }

  me(ctx: RlsContext) {
    return this.rlsDb.run(ctx, async (db) => {
      const [row] = await db.select().from(landlords).where(eq(landlords.userId, ctx.userId));
      return row ?? null;
    });
  }

  // RLS also enforces the "pending only" self-edit rule (landlords_self_update);
  // this check gives a clean 403 instead of a silent zero-row update.
  upsertProfile(ctx: RlsContext, input: UpsertLandlordProfileInput) {
    return this.rlsDb.run(ctx, async (db) => {
      const [existing] = await db.select().from(landlords).where(eq(landlords.userId, ctx.userId));

      if (!existing) {
        const [row] = await db
          .insert(landlords)
          .values({
            userId: ctx.userId,
            legalName: input.legalName,
            idDocStorageKey: input.idDocStorageKey ?? null,
          })
          .returning();
        return row;
      }

      if (existing.kycStatus !== 'pending') {
        throw new ForbiddenException('Profile is under review and can no longer be edited');
      }

      const [row] = await db
        .update(landlords)
        .set({
          legalName: input.legalName,
          idDocStorageKey: input.idDocStorageKey ?? existing.idDocStorageKey,
        })
        .where(eq(landlords.userId, ctx.userId))
        .returning();
      return row;
    });
  }
}
