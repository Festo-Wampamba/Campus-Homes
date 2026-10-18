import { z } from 'zod';

// `activity` is retained for existing rows created before the dedicated
// event choice was introduced. New personal calendar entries use `event`.
export const CALENDAR_EVENT_TYPES = ['task', 'event', 'reminder', 'activity'] as const;
export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

// Minutes before the start at which the owner is emailed and notified in the
// app, Google Calendar style: a day, 10 h, 5 h, 30, 15, 5 and 1 minute.
export const CALENDAR_REMINDER_OFFSETS_MINUTES = [1440, 600, 300, 30, 15, 5, 1] as const;

export const createCalendarEventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  eventType: z.enum(CALENDAR_EVENT_TYPES).default('task'),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  allDay: z.boolean().default(false),
  /** Email and in-app reminders at CALENDAR_REMINDER_OFFSETS_MINUTES. */
  remind: z.boolean().default(true),
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
  remind: z.boolean().optional(),
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
  remind: boolean;
  createdAt: string;
  updatedAt: string;
};
