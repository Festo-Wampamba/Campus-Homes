import { ForbiddenException, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { UpsertLandlordProfileInput } from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { landlords } from '../../db/schema';

@Injectable()
export class LandlordsService {
  constructor(private readonly rlsDb: RlsDb) {}

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
