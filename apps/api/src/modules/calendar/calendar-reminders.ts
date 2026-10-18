import { Injectable, Logger } from '@nestjs/common';

import { CALENDAR_REMINDER_OFFSETS_MINUTES } from '@campushomes/shared';

import { loadEnv } from '../../config/env';
import { RlsDb } from '../../db/db.module';
import { sendCalendarReminderEmail } from '../auth/auth.email';
import { NotificationsService } from '../notifications/notifications.service';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const MINUTE = 60_000;

/** Which reminder is due now. Offsets whose time has passed but were never
 * sent (an event created 2 hours ahead, or a job that missed a minute) are
 * marked sent together, and only the one closest to the start goes out, so a
 * late run never sends a burst of stale reminders. */
export function dueReminder(startsAt: Date, now: Date, sent: readonly number[]) {
  if (startsAt.getTime() <= now.getTime()) return null;
  const due = CALENDAR_REMINDER_OFFSETS_MINUTES.filter(
    (offset) => startsAt.getTime() - offset * MINUTE <= now.getTime() && !sent.includes(offset),
  );
  if (!due.length) return null;
  return { offset: Math.min(...due), markSent: [...due] };
}

/** "in 1 day", "in 10 hours", "in 30 minutes", "in 1 minute". */
export function startsInLabel(startsAt: Date, now: Date): string {
  const minutes = Math.max(1, Math.round((startsAt.getTime() - now.getTime()) / MINUTE));
  if (minutes >= 1440) return `in ${Math.round(minutes / 1440)} day${minutes >= 2160 ? 's' : ''}`;
  if (minutes >= 60) {
    const hours = Math.round(minutes / 60);
    return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

type DueRow = {
  id: string;
  userId: string;
  title: string;
  eventType: string;
  startsAt: Date;
  allDay: boolean;
  remindersSent: number[];
  email: string | null;
  name: string | null;
  role: string;
};

const CALENDAR_HREF: Record<string, string> = { student: '/calendar', landlord: '/landlord/calendar' };

/** Runs every minute from the jobs queue (jobs.module.ts). */
@Injectable()
export class CalendarReminderService {
  private readonly logger = new Logger(CalendarReminderService.name);

  constructor(
    private readonly rlsDb: RlsDb,
    private readonly notifications: NotificationsService,
  ) {}

  async run(now = new Date()): Promise<number> {
    const rows = await this.rlsDb.run({ userId: NIL_UUID, role: 'service_role' }, async (_db, client) =>
      (await client.query<DueRow>(
        `SELECT e.id, e.user_id AS "userId", e.title, e.event_type AS "eventType", e.starts_at AS "startsAt",
                e.all_day AS "allDay", e.reminders_sent AS "remindersSent", u.email, u.name, u.role::text AS role
         FROM calendar_events e JOIN users u ON u.id = e.user_id
         WHERE e.remind AND NOT e.done AND u.deleted_at IS NULL AND u.status = 'active'
           AND e.starts_at > $1 AND e.starts_at <= $1::timestamptz + interval '1 day 1 minute'`, [now],
      )).rows,
    );
    let sent = 0;
    for (const row of rows) {
      const due = dueReminder(row.startsAt, now, row.remindersSent);
      if (!due) continue;
      // Claim first: only one API instance may send a given reminder.
      const claimed = await this.rlsDb.run({ userId: NIL_UUID, role: 'service_role' }, async (_db, client) =>
        (await client.query(
          `UPDATE calendar_events SET reminders_sent = reminders_sent || $2::integer[]
           WHERE id = $1 AND NOT (reminders_sent && $2::integer[]) AND starts_at = $3`,
          [row.id, due.markSent, row.startsAt],
        )).rowCount,
      );
      if (!claimed) continue;
      await this.deliver(row, now).catch((err: unknown) =>
        this.logger.warn(`Calendar reminder ${row.id} failed: ${err instanceof Error ? err.message : String(err)}`),
      );
      sent += 1;
    }
    return sent;
  }

  private async deliver(row: DueRow, now: Date) {
    const when = startsInLabel(row.startsAt, now);
    const href = CALENDAR_HREF[row.role] ?? null;
    await this.notifications.notify(row.userId, 'calendar.reminder', 'in_app', {
      eventId: row.id,
      message: `Reminder: "${row.title}" starts ${when}.`,
      ...(href ? { href } : {}),
    });
    if (row.email) {
      const env = loadEnv();
      await sendCalendarReminderEmail(env, row.email, {
        name: row.name, title: row.title, eventType: row.eventType, startsAt: row.startsAt, allDay: row.allDay, startsIn: when,
        calendarUrl: href ? `${env.WEB_ORIGIN}${href}` : null,
      });
    }
  }
}
