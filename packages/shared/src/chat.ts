import { z } from 'zod';

import { uuid } from './common.js';

export const sendMessageSchema = z.object({
  body: z.string().min(1).max(2000), // 2000 mirrors the DB CHECK
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const startConversationSchema = z.object({ recipientUserId: uuid });
export type StartConversationInput = z.infer<typeof startConversationSchema>;

export const pusherAuthSchema = z.object({
  socket_id: z.string().min(1),
  channel_name: z.string().min(1),
});
export type PusherAuthInput = z.infer<typeof pusherAuthSchema>;

export const chatMessageSchema = z.object({
  id: uuid,
  threadId: uuid,
  fromUserId: uuid,
  body: z.string(),
  sentAt: z.iso.datetime(),
  editedAt: z.iso.datetime().nullable().optional(),
  readAt: z.iso.datetime().nullable(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatThreadSchema = z.object({
  id: uuid,
  reservationId: uuid.nullable(),
  studentId: uuid,
  landlordId: uuid,
  lastMessageAt: z.iso.datetime().nullable(),
  counterpartName: z.string().nullable().optional(),
  counterpartKind: z.enum(['student', 'landlord']).optional(),
  lastMessageSnippet: z.string().nullable().optional(),
  unreadCount: z.number().int().nonnegative().optional(),
});
export type ChatThread = z.infer<typeof chatThreadSchema>;

export const chatContactSchema = z.object({
  userId: uuid,
  name: z.string().nullable(),
  kind: z.enum(['student', 'landlord']),
  context: z.string(),
});
export type ChatContact = z.infer<typeof chatContactSchema>;
