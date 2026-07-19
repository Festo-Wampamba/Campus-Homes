import { z } from 'zod';

import { uuid } from './common.js';

export const sendMessageSchema = z.object({
  body: z.string().min(1).max(2000), // 2000 mirrors the DB CHECK
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

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
  readAt: z.iso.datetime().nullable(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatThreadSchema = z.object({
  id: uuid,
  reservationId: uuid,
  studentId: uuid,
  landlordId: uuid,
  lastMessageAt: z.iso.datetime().nullable(),
});
export type ChatThread = z.infer<typeof chatThreadSchema>;
