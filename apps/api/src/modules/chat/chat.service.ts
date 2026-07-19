import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';

import type { RealtimeAdapter } from '../../adapters/realtime.adapter';
import type { RlsContext } from '../../db/rls-context';
import { firstRow } from '../../db/client';
import { RlsDb } from '../../db/db.module';
import { chatMessages, chatThreads } from '../../db/schema';
import { REALTIME } from './chat.tokens';

@Injectable()
export class ChatService {
  constructor(
    private readonly rlsDb: RlsDb,
    @Inject(REALTIME) private readonly realtime: RealtimeAdapter,
  ) {}

  /** Thread provisioning is service-side (§6): scoped to one reservation,
   * participants derived from the reservation — never client-supplied. */
  async ensureThread(ctx: RlsContext, reservationId: string) {
    return this.rlsDb.run({ userId: ctx.userId, role: 'service_role' }, async (db, client) => {
      const existing = await db.query.chatThreads.findFirst({
        where: eq(chatThreads.reservationId, reservationId),
      });
      if (existing) {
        if (existing.studentId !== ctx.userId && existing.landlordId !== ctx.userId) {
          throw new ForbiddenException('Not a participant');
        }
        return existing;
      }
      const partiesRes = await client.query(
        `SELECT r.student_id, p.landlord_id
         FROM reservations r
         JOIN units u ON u.id = r.unit_id
         JOIN listings l ON l.id = u.listing_id
         JOIN properties p ON p.id = l.property_id
         WHERE r.id = $1`,
        [reservationId],
      );
      if (partiesRes.rowCount === 0) {
        throw new NotFoundException('Reservation not found');
      }
      const { student_id, landlord_id } = partiesRes.rows[0] as {
        student_id: string;
        landlord_id: string;
      };
      if (ctx.userId !== student_id && ctx.userId !== landlord_id) {
        throw new ForbiddenException('Not a party to this reservation');
      }
      const [thread] = await db
        .insert(chatThreads)
        .values({ reservationId, studentId: student_id, landlordId: landlord_id })
        .onConflictDoNothing()
        .returning();
      return (
        thread ??
        (await db.query.chatThreads.findFirst({
          where: eq(chatThreads.reservationId, reservationId),
        }))
      );
    });
  }

  /** Message insert runs as the caller — RLS proves thread membership. */
  async sendMessage(ctx: RlsContext, threadId: string, body: string) {
    const message = await this.rlsDb.run(ctx, async (db) => {
      const row = firstRow(
        await db
          .insert(chatMessages)
          .values({ threadId, fromUserId: ctx.userId, body })
          .returning(),
      );
      await db
        .update(chatThreads)
        .set({ lastMessageAt: row.sentAt })
        .where(eq(chatThreads.id, threadId));
      return row;
    });
    await this.realtime.trigger(`private-thread-${threadId}`, 'message', {
      id: message.id,
      threadId,
      fromUserId: message.fromUserId,
      body: message.body,
      sentAt: message.sentAt,
    });
    return message;
  }

  messages(ctx: RlsContext, threadId: string) {
    // RLS returns nothing if the caller isn't a participant (or ops).
    return this.rlsDb.run(ctx, (db) =>
      db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.threadId, threadId))
        .orderBy(desc(chatMessages.sentAt))
        .limit(100),
    );
  }

  myThreads(ctx: RlsContext) {
    return this.rlsDb.run(ctx, (db) =>
      db.select().from(chatThreads).orderBy(desc(chatThreads.lastMessageAt)),
    );
  }

  private static readonly THREAD_CHANNEL_RE = /^private-thread-([0-9a-f-]{36})$/i;

  /** Signs a pusher-js private-channel subscription. Only a thread
   * participant (or ops, per RLS) may subscribe to that thread's channel —
   * the regex + RLS-scoped lookup together reject both malformed channel
   * names and channels for threads the caller isn't part of. */
  authorizeChannel(ctx: RlsContext, socketId: string, channelName: string) {
    const match = ChatService.THREAD_CHANNEL_RE.exec(channelName);
    if (!match?.[1]) {
      throw new ForbiddenException('Invalid channel');
    }
    const threadId = match[1];
    return this.rlsDb.run(ctx, async (db) => {
      const thread = await db.query.chatThreads.findFirst({
        where: eq(chatThreads.id, threadId),
      });
      if (!thread) {
        throw new ForbiddenException('Not a participant');
      }
      const auth = this.realtime.authorizeChannel(socketId, channelName);
      if (!auth) {
        throw new ServiceUnavailableException('Realtime not configured');
      }
      return auth;
    });
  }
}
