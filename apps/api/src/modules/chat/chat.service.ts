import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';

import type { RealtimeAdapter } from '../../adapters/realtime.adapter';
import type { RlsContext } from '../../db/rls-context';
import { firstRow } from '../../db/client';
import { RlsDb } from '../../db/db.module';
import { chatMessages, chatThreads } from '../../db/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { REALTIME } from './chat.tokens';

@Injectable()
export class ChatService {
  constructor(
    private readonly rlsDb: RlsDb,
    @Inject(REALTIME) private readonly realtime: RealtimeAdapter,
    @Optional() private readonly notifications?: NotificationsService,
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
         JOIN beds b ON b.id = r.bed_id
         JOIN units u ON u.id = b.unit_id
         JOIN properties p ON p.id = u.property_id
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
      return row;
    });
    // Threads are service-maintained; participant RLS deliberately grants
    // SELECT only, so ordering metadata must be updated in trusted context.
    await this.rlsDb.run({ userId: ctx.userId, role: 'service_role' }, (db) =>
      db.update(chatThreads).set({ lastMessageAt: message.sentAt }).where(eq(chatThreads.id, threadId)),
    );
    await this.realtime.trigger(`private-thread-${threadId}`, 'message', {
      id: message.id,
      threadId,
      fromUserId: message.fromUserId,
      body: message.body,
      sentAt: message.sentAt,
      editedAt: message.editedAt,
      readAt: message.readAt,
    });
    const recipient = await this.rlsDb.run(
      { userId: ctx.userId, role: 'service_role' },
      async (_db, client) => (await client.query<{ recipient_id: string; recipient_is_landlord: boolean; sender_name: string }>(
        `SELECT CASE WHEN student_id = $2 THEN landlord_id ELSE student_id END AS recipient_id,
                (landlord_id <> $2) AS recipient_is_landlord,
                COALESCE(NULLIF(u.name, ''), u.email, u.phone, 'A CampusHomes user') AS sender_name
         FROM chat_threads t JOIN users u ON u.id = $2
         WHERE t.id = $1 AND (student_id = $2 OR landlord_id = $2)`,
        [threadId, ctx.userId],
      )).rows[0],
    );
    if (recipient) {
      this.notifications?.notify(recipient.recipient_id, 'chat.message_received', 'in_app', {
        message: `${recipient.sender_name} sent you a message: ${message.body.slice(0, 100)}`,
        href: recipient.recipient_is_landlord ? '/landlord/messages' : '/messages',
        threadId,
      }).catch((err: unknown) => {
        // The message is already durable. Notification delivery must not make
        // the sender see a false failure and send the same message twice.
        console.error('[chat] recipient notification failed:', err);
      });
    }
    return message;
  }

  async editMessage(ctx: RlsContext, threadId: string, messageId: string, body: string) {
    const updated = await this.rlsDb.run(ctx, async (db) => {
      const [row] = await db.update(chatMessages).set({ body, editedAt: new Date() }).where(and(
        eq(chatMessages.id, messageId),
        eq(chatMessages.threadId, threadId),
        eq(chatMessages.fromUserId, ctx.userId),
      )).returning();
      return row;
    });
    if (!updated) {
      throw new ForbiddenException('You can only edit your own message in this conversation');
    }
    await this.realtime.trigger(`private-thread-${threadId}`, 'message-edited', updated);
    return updated;
  }

  /** People the current user can safely start a conversation with. Students
   * may contact approved landlords; landlords may contact students who have
   * already enquired or reserved against one of their properties. */
  contacts(ctx: RlsContext) {
    return this.rlsDb.run({ userId: ctx.userId, role: 'service_role' }, async (_db, client) => {
      const landlord = await client.query<{ verified: boolean }>(
        `SELECT (kyc_status = 'verified') AS verified FROM landlords WHERE user_id = $1`, [ctx.userId],
      );
      if (landlord.rows[0]?.verified) {
        return (await client.query(
          `SELECT DISTINCT u.id AS "userId", u.name, 'student' AS kind,
                  'Enquiry or reservation' AS context
           FROM users u
           WHERE u.status = 'active' AND u.deleted_at IS NULL AND (
             EXISTS (SELECT 1 FROM inquiries i WHERE i.student_id = u.id AND i.landlord_id = $1)
             OR EXISTS (
               SELECT 1 FROM reservations r JOIN beds b ON b.id=r.bed_id JOIN units un ON un.id=b.unit_id
               JOIN properties p ON p.id=un.property_id WHERE r.student_id=u.id AND p.landlord_id=$1
             )
           ) ORDER BY u.name NULLS LAST`, [ctx.userId],
        )).rows;
      }
      return (await client.query(
        `SELECT DISTINCT u.id AS "userId", COALESCE(NULLIF(l.legal_name, ''), u.name) AS name,
                'landlord' AS kind, 'Verified CampusHomes landlord' AS context
         FROM landlords l JOIN users u ON u.id=l.user_id
         JOIN properties p ON p.landlord_id=l.user_id
         JOIN listings li ON li.property_id=p.id AND li.status='verified'
         WHERE l.kyc_status='verified' AND u.status='active' AND u.deleted_at IS NULL
         ORDER BY name NULLS LAST`,
      )).rows;
    });
  }

  async ensureDirectThread(ctx: RlsContext, recipientUserId: string) {
    if (recipientUserId === ctx.userId) throw new ForbiddenException('Choose another person');
    return this.rlsDb.run({ userId: ctx.userId, role: 'service_role' }, async (_db, client) => {
      const parties = await client.query<{ student_id: string; landlord_id: string }>(
        `SELECT $1::uuid AS student_id, $2::uuid AS landlord_id
         WHERE EXISTS (SELECT 1 FROM students s WHERE s.user_id=$1)
           AND EXISTS (SELECT 1 FROM landlords l JOIN users u ON u.id=l.user_id
                       JOIN properties p ON p.landlord_id=l.user_id JOIN listings li ON li.property_id=p.id
                       WHERE l.user_id=$2 AND l.kyc_status='verified' AND u.status='active' AND li.status='verified')
         UNION ALL
         SELECT $2::uuid, $1::uuid
         WHERE EXISTS (SELECT 1 FROM landlords l WHERE l.user_id=$1 AND l.kyc_status='verified')
           AND EXISTS (SELECT 1 FROM students s WHERE s.user_id=$2)
           AND (EXISTS (SELECT 1 FROM inquiries i WHERE i.student_id=$2 AND i.landlord_id=$1)
                OR EXISTS (SELECT 1 FROM reservations r JOIN beds b ON b.id=r.bed_id JOIN units un ON un.id=b.unit_id
                           JOIN properties p ON p.id=un.property_id WHERE r.student_id=$2 AND p.landlord_id=$1))
         LIMIT 1`, [ctx.userId, recipientUserId],
      );
      const party = parties.rows[0];
      if (!party) throw new ForbiddenException('This conversation is not available');
      const result = await client.query(
        `INSERT INTO chat_threads (reservation_id, student_id, landlord_id)
         VALUES (NULL, $1, $2)
         ON CONFLICT (student_id, landlord_id) WHERE reservation_id IS NULL
         DO UPDATE SET student_id=EXCLUDED.student_id
         RETURNING id, reservation_id AS "reservationId", student_id AS "studentId",
                   landlord_id AS "landlordId", last_message_at AS "lastMessageAt"`, [party.student_id, party.landlord_id],
      );
      return { ...result.rows[0], counterpartName: null };
    });
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

  async markRead(ctx: RlsContext, threadId: string) {
    return this.rlsDb.run({ userId: ctx.userId, role: 'service_role' }, async (_db, client) => {
      const participant = await client.query(
        `SELECT 1 FROM chat_threads
         WHERE id = $1 AND (student_id = $2 OR landlord_id = $2)`,
        [threadId, ctx.userId],
      );
      if (!participant.rowCount) throw new ForbiddenException('Not a participant');

      const updated = await client.query(
        `UPDATE chat_messages
         SET read_at = now()
         WHERE thread_id = $1 AND from_user_id IS DISTINCT FROM $2 AND read_at IS NULL
         RETURNING id`,
        [threadId, ctx.userId],
      );
      await client.query(
        `UPDATE notifications
         SET read_at = now()
         WHERE user_id = $1 AND template_key = 'chat.message_received'
           AND payload->>'threadId' = $2 AND read_at IS NULL`,
        [ctx.userId, threadId],
      );
      return { updated: updated.rowCount ?? 0 };
    });
  }

  myThreads(ctx: RlsContext) {
    return this.rlsDb.run({ userId: ctx.userId, role: 'service_role' }, async (_db, client) =>
      (await client.query(
        `SELECT t.id, t.reservation_id AS "reservationId", t.student_id AS "studentId",
                t.landlord_id AS "landlordId", t.last_message_at AS "lastMessageAt",
                COALESCE(NULLIF(other.name, ''), other.email, other.phone, 'CampusHomes user') AS "counterpartName",
                CASE WHEN t.student_id = $1 THEN 'landlord' ELSE 'student' END AS "counterpartKind",
                latest.body AS "lastMessageSnippet",
                count(unread.id)::int AS "unreadCount"
         FROM chat_threads t
         JOIN users other ON other.id = CASE WHEN t.student_id=$1 THEN t.landlord_id ELSE t.student_id END
         LEFT JOIN LATERAL (
           SELECT body FROM chat_messages m
           WHERE m.thread_id = t.id AND m.deleted_at IS NULL
           ORDER BY m.sent_at DESC LIMIT 1
         ) latest ON true
         LEFT JOIN chat_messages unread ON unread.thread_id = t.id
           AND unread.from_user_id IS DISTINCT FROM $1 AND unread.read_at IS NULL
         WHERE t.student_id=$1 OR t.landlord_id=$1
         GROUP BY t.id, other.name, other.email, other.phone, latest.body
         ORDER BY t.last_message_at DESC NULLS LAST, t.created_at DESC`, [ctx.userId],
      )).rows,
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
