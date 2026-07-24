import { z } from 'zod';

import { uuid } from './common.js';

export const ACTIVITY_TYPES = ['task', 'meeting', 'visit', 'maintenance', 'other'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_STATUSES = ['pending', 'in_progress', 'done', 'cancelled'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const createActivitySchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  activityType: z.enum(ACTIVITY_TYPES).default('task'),
  status: z.enum(ACTIVITY_STATUSES).default('pending'),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  allDay: z.boolean().default(false),
  assignedTo: uuid.nullable().optional(),
});
export type CreateActivityInput = z.infer<typeof createActivitySchema>;

export const updateActivitySchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  activityType: z.enum(ACTIVITY_TYPES).optional(),
  status: z.enum(ACTIVITY_STATUSES).optional(),
  startsAt: z.iso.datetime({ offset: true }).optional(),
  endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  allDay: z.boolean().optional(),
  assignedTo: uuid.nullable().optional(),
});
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;

// List/detail response shape — service joins in assignee/creator names so the
// admin UI never has to issue a second round trip per row.
export type Activity = {
  id: string;
  title: string;
  description: string | null;
  activityType: ActivityType;
  status: ActivityStatus;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  assignedTo: string | null;
  assignedToName: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
};
