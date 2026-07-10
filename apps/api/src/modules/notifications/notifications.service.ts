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
