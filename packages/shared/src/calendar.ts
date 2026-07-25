import { z } from 'zod';

export const CALENDAR_EVENT_TYPES = ['task', 'reminder', 'activity'] as const;
export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

export const createCalendarEventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  eventType: z.enum(CALENDAR_EVENT_TYPES).default('task'),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  allDay: z.boolean().default(false),
});
export type CreateCalendarEventInput = z.infer<typeof createCalendarEventSchema>;

export const updateCalendarEventSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  eventType: z.enum(CALENDAR_EVENT_TYPES).optional(),
  startsAt: z.iso.datetime({ offset: true }).optional(),
  endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  allDay: z.boolean().optional(),
  done: z.boolean().optional(),
});
export type UpdateCalendarEventInput = z.infer<typeof updateCalendarEventSchema>;

export type CalendarEvent = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  eventType: CalendarEventType;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  done: boolean;
  createdAt: string;
  updatedAt: string;
};
