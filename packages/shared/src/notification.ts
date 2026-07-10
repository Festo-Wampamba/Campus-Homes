import { z } from 'zod';

import { NOTIFICATION_CHANNELS, NOTIFICATION_STATUSES } from './enums.js';
import { uuid } from './common.js';

// Web Push subscription as produced by PushManager.subscribe().
export const registerPushSubscriptionSchema = z.object({
  endpoint: z.url(),
  p256dh: z.string().min(1),
  authKey: z.string().min(1),
  deviceLabel: z.string().max(200).optional(),
});
export type RegisterPushSubscriptionInput = z.infer<typeof registerPushSubscriptionSchema>;

export const notificationSchema = z.object({
  id: uuid,
  templateKey: z.string(),
  channel: z.enum(NOTIFICATION_CHANNELS),
  payload: z.record(z.string(), z.unknown()),
  status: z.enum(NOTIFICATION_STATUSES),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type Notification = z.infer<typeof notificationSchema>;
