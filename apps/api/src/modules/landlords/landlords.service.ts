import { ForbiddenException, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { UpsertLandlordProfileInput } from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { landlords, users } from '../../db/schema';

@Injectable()
export class LandlordsService {
  constructor(private readonly rlsDb: RlsDb) {}

  me(ctx: RlsContext) {
    return this.rlsDb.run(ctx, async (db) => {
      const [landlord] = await db.select().from(landlords).where(eq(landlords.userId, ctx.userId));
      if (!landlord) return null;
      // users_read lets a caller read their own row — no service_role needed.
      const [particulars] = await db
        .select({
          name: users.name,
          dateOfBirth: users.dateOfBirth,
          gender: users.gender,
          nationality: users.nationality,
          address: users.address,
          emergencyContactName: users.emergencyContactName,
          emergencyContactPhone: users.emergencyContactPhone,
        })
        .from(users)
        .where(eq(users.id, ctx.userId));
      return { ...landlord, ...particulars };
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
