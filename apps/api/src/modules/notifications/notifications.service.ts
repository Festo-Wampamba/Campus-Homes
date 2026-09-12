import { Inject, Injectable, Logger } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';

import type { RegisterPushSubscriptionInput } from '@campushomes/shared';

import type { MessagingAdapter } from '../../adapters/messaging.adapter';
import type { RlsContext } from '../../db/rls-context';
import { firstRow } from '../../db/client';
import { RlsDb } from '../../db/db.module';
import { notifications, pushSubscriptions, users } from '../../db/schema';
import { MESSAGING } from '../auth/auth.tokens';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly rlsDb: RlsDb,
    @Inject(MESSAGING) private readonly messaging: MessagingAdapter,
  ) {}

  /** Domain-event fan-out (§6): record the notification, then deliver.
   * SMS goes out through the MessagingAdapter; web-push delivery lands when
   * VAPID keys are provisioned (subscriptions are already being collected). */
  async notify(
    userId: string,
    templateKey: string,
    channel: 'sms' | 'push' | 'in_app',
    payload: Record<string, unknown> & { message?: string },
  ): Promise<void> {
    await this.rlsDb.run({ userId, role: 'service_role' }, async (db) => {
      const row = firstRow(
        await db
          .insert(notifications)
          .values({ userId, templateKey, channel, payload, status: 'pending' })
          .returning(),
      );

      if (channel === 'sms' && payload.message) {
        const [user] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, userId));
        if (user?.phone) {
          try {
            await this.messaging.sendSms(user.phone, payload.message);
            await db
              .update(notifications)
              .set({ status: 'sent', sentAt: new Date() })
              .where(eq(notifications.id, row.id));
          } catch (err) {
            this.logger.error(`SMS delivery failed for notification ${row.id}`, err as Error);
            await db
              .update(notifications)
              .set({ status: 'failed', deliveryStatus: String(err) })
              .where(eq(notifications.id, row.id));
          }
        }
      }
      // push/in_app rows stay pending: in_app is read via the feed below;
      // push drains once a WebPushAdapter (VAPID) exists.
    });
  }

  registerPushSubscription(ctx: RlsContext, input: RegisterPushSubscriptionInput) {
    // push_subscriptions has self-service policies — runs as the caller.
    return this.rlsDb.run(ctx, async (db) => {
      const [sub] = await db
        .insert(pushSubscriptions)
        .values({
          userId: ctx.userId,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          authKey: input.authKey,
          deviceLabel: input.deviceLabel,
        })
        .onConflictDoNothing()
        .returning();
      return sub ?? { alreadyRegistered: true };
    });
  }

  feed(ctx: RlsContext) {
    return this.rlsDb.run(ctx, (db) =>
      db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(50),
    );
  }

  /** Reconcile durable notifications with queues that can predate the event
   * notification feature. This makes an existing pending application visible
   * immediately after rollout, while still keeping the normal submit event as
   * the fast path. */
  async feedWithActions(ctx: RlsContext, roleKeys: string[]) {
    if (roleKeys.some((role) => role === 'super_admin' || role === 'platform_admin')) {
      await this.rlsDb.run({ userId: ctx.userId, role: 'service_role' }, async (_db, client) => {
        const pending = await client.query<{ count: number }>(`
          SELECT count(DISTINCT l.user_id)::int AS count
          FROM landlords l
          JOIN users u ON u.id = l.user_id
          WHERE l.kyc_status = 'pending'
            AND u.status = 'active'
            AND u.deleted_at IS NULL
            AND EXISTS (SELECT 1 FROM properties p WHERE p.landlord_id = l.user_id)
        `);
        const count = pending.rows[0]?.count ?? 0;
        const unread = await client.query<{ id: string }>(`
          SELECT id FROM notifications
          WHERE user_id = $1
            AND template_key = 'landlord.application_submitted'
            AND read_at IS NULL
          ORDER BY created_at DESC LIMIT 1
        `, [ctx.userId]);
        if (count > 0) {
          const payload = JSON.stringify({
            message: `${count} landlord application${count === 1 ? '' : 's'} awaiting approval.`,
            href: '/admin/landlord-accounts',
            pendingCount: count,
          });
          if (unread.rows[0]) {
            await client.query('UPDATE notifications SET payload = $2::jsonb WHERE id = $1', [unread.rows[0].id, payload]);
          } else {
            await client.query(
              `INSERT INTO notifications (user_id, template_key, channel, payload, status)
               VALUES ($1, 'landlord.application_submitted', 'in_app', $2::jsonb, 'pending')`,
              [ctx.userId, payload],
            );
          }
        } else if (unread.rows[0]) {
          await client.query(
            `UPDATE notifications SET read_at = now()
             WHERE user_id = $1 AND template_key = 'landlord.application_submitted' AND read_at IS NULL`,
            [ctx.userId],
          );
        }
      });
    }
    return this.feed(ctx);
  }

  markRead(ctx: RlsContext, notificationId: string) {
    return this.rlsDb.run(ctx, async (db) => {
      const [row] = await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(eq(notifications.id, notificationId))
        .returning();
      return row ?? { updated: false };
    });
  }
}
