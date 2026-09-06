import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import type {
  PendingLandlordAccount,
  RejectLandlordAccountInput,
  UpsertLandlordProfileInput,
} from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { landlords, users } from '../../db/schema';
import { AuditService } from '../ops/audit.service';
import { assignRoleInTransaction } from '../staff/role-assignment.service';

const SERVICE_CTX: RlsContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'service_role',
};

@Injectable()
export class LandlordsService {
  constructor(
    private readonly rlsDb: RlsDb,
    private readonly audit: AuditService,
  ) {}

  /** Adds landlord access to the already authenticated identity without
   * replacing student or other access. Property/KYC approval remains a
   * separate publication control in the onboarding workflow. */
  enroll(ctx: RlsContext) {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const user = (await client.query<{ id: string; status: string; deletedAt: Date | null }>(`
        SELECT id, status::text, deleted_at AS "deletedAt"
        FROM users WHERE id = $1 FOR UPDATE
      `, [ctx.userId])).rows[0];
      if (!user || user.deletedAt || user.status !== 'active') {
        throw new ForbiddenException('Only an active account can enroll as a landlord');
      }
      const assignment = await assignRoleInTransaction(
        client,
        ctx,
        ctx.userId,
        {
          roleKey: 'landlord',
          scopeType: 'own',
          reason: 'Self-service landlord enrollment',
        },
      );
      return { enrolled: true, assignmentId: assignment.id, onboardingPath: '/landlord/onboarding' };
    });
  }

  // Ops lead / admin review queue (landlords.review_kyc — same permission
  // that already gates the KYC queue; this is the earlier gate in the same
  // reviewer's workflow, not a separate role).
  pendingAccounts(): Promise<PendingLandlordAccount[]> {
    return this.rlsDb.run(SERVICE_CTX, async (db) => {
      const rows = await db
        .select({ userId: users.id, name: users.name, phone: users.phone, createdAt: users.createdAt })
        .from(users)
        .where(and(eq(users.role, 'landlord'), eq(users.status, 'pending')))
        .orderBy(users.createdAt);
      return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
    });
  }

  async approveAccount(actor: RlsContext, userId: string) {
    const [row] = await this.rlsDb.run(SERVICE_CTX, (db) =>
      db
        .update(users)
        .set({ status: 'active' })
        .where(and(eq(users.id, userId), eq(users.role, 'landlord'), eq(users.status, 'pending')))
        .returning({ id: users.id }),
    );
    if (!row) throw new NotFoundException('No pending landlord account found for that user');
    await this.audit.record(actor, 'landlord_account.approve', 'user', userId, {});
    return { approved: true };
  }

  async rejectAccount(actor: RlsContext, userId: string, input: RejectLandlordAccountInput) {
    const [row] = await this.rlsDb.run(SERVICE_CTX, (db) =>
      db
        .update(users)
        .set({ status: 'suspended', notes: input.reason })
        .where(and(eq(users.id, userId), eq(users.role, 'landlord'), eq(users.status, 'pending')))
        .returning({ id: users.id }),
    );
    if (!row) throw new NotFoundException('No pending landlord account found for that user');
    await this.audit.record(actor, 'landlord_account.reject', 'user', userId, { reason: input.reason });
    return { rejected: true };
  }

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
            whatsappNumber: input.whatsappNumber ?? null,
            businessType: input.businessType,
            businessTypeOther: input.businessTypeOther ?? null,
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
          whatsappNumber: input.whatsappNumber ?? existing.whatsappNumber,
          businessType: input.businessType,
          businessTypeOther: input.businessTypeOther ?? existing.businessTypeOther,
        })
        .where(eq(landlords.userId, ctx.userId))
        .returning();
      return row;
    });
  }
}
