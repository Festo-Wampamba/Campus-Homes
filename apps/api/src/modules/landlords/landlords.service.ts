import { ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { and, eq, exists } from 'drizzle-orm';

import type {
  PendingLandlordAccount,
  RejectLandlordAccountInput,
  UpsertLandlordProfileInput,
} from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { landlords, properties, users } from '../../db/schema';
import { AuditService } from '../ops/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
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
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /** Adds the application-only landlord role to an existing identity. The
   * assignment intentionally permits only onboarding until the reviewer
   * verifies the landlord profile; normal landlord operations are guarded by
   * RolesGuard's approval check. */
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

  // The account-review queue is the landlord's submitted identity plus at
  // least one submitted property. Looking at users.status was the original
  // bug: self-enrolment keeps the shared (often student) identity active, so
  // those landlords never appeared here despite having a pending KYC record.
  pendingAccounts(): Promise<PendingLandlordAccount[]> {
    return this.rlsDb.run(SERVICE_CTX, async (db) => {
      const rows = await db
        .select({ userId: users.id, name: users.name, phone: users.phone, createdAt: users.createdAt })
        .from(users)
        .innerJoin(landlords, eq(landlords.userId, users.id))
        .where(and(
          eq(users.status, 'active'),
          eq(landlords.kycStatus, 'pending'),
          exists(
            db.select({ id: properties.id }).from(properties).where(eq(properties.landlordId, users.id)),
          ),
        ))
        .orderBy(landlords.createdAt);
      return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
    });
  }

  approvedAccounts(): Promise<PendingLandlordAccount[]> {
    return this.rlsDb.run(SERVICE_CTX, async (db) => {
      const rows = await db
        .select({ userId: users.id, name: users.name, phone: users.phone, createdAt: users.createdAt })
        .from(users)
        .innerJoin(landlords, eq(landlords.userId, users.id))
        .where(and(eq(users.status, 'active'), eq(landlords.kycStatus, 'verified')))
        .orderBy(landlords.kycReviewedAt);
      return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
    });
  }

  async approveAccount(actor: RlsContext, userId: string) {
    const approved = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const { rows } = await client.query<{ id: string }>(
        `UPDATE landlords SET kyc_status = 'verified', kyc_reviewed_by = $2, kyc_reviewed_at = now()
         WHERE user_id = $1 AND kyc_status = 'pending' RETURNING user_id AS id`,
        [userId, actor.userId],
      );
      if (!rows[0]) return false;
      await client.query(
        `UPDATE properties SET status = 'active'
         WHERE landlord_id = $1 AND status = 'pending_kyc'`,
        [userId],
      );
      return true;
    });
    if (!approved) throw new NotFoundException('No submitted landlord application awaiting approval was found');
    await this.audit.record(actor, 'landlord_account.approve', 'user', userId, {});
    await this.notifications?.notify(userId, 'landlord.application_approved', 'in_app', {
      message: 'Your landlord application has been approved. Your dashboard and property tools are now available.',
      href: '/landlord',
    });
    return { approved: true };
  }

  async rejectAccount(actor: RlsContext, userId: string, input: RejectLandlordAccountInput) {
    const [row] = await this.rlsDb.run(SERVICE_CTX, (db) =>
      db
        .update(landlords)
        .set({ kycStatus: 'rejected', kycReviewedBy: actor.userId, kycReviewedAt: new Date() })
        .where(and(eq(landlords.userId, userId), eq(landlords.kycStatus, 'pending')))
        .returning({ id: landlords.userId }),
    );
    if (!row) throw new NotFoundException('No pending landlord account found for that user');
    await this.rlsDb.run(SERVICE_CTX, (db) =>
      db.update(users).set({ notes: input.reason, updatedAt: new Date() }).where(eq(users.id, userId)),
    );
    await this.audit.record(actor, 'landlord_account.reject', 'user', userId, { reason: input.reason });
    await this.notifications?.notify(userId, 'landlord.application_rejected', 'in_app', {
      message: `Your landlord application was not approved. ${input.reason}`,
      href: '/landlord/approval-pending',
    });
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
