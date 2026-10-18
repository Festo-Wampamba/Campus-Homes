/**
 * Calendar reminders against the real database: a due reminder is sent once,
 * recorded on the event, and never sent again on the next run.
 */
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import { CalendarReminderService } from '../../src/modules/calendar/calendar-reminders';
import type { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { testDatabaseUrl } from '../test-database-url';

jest.mock('../../src/modules/auth/auth.email', () => ({ sendCalendarReminderEmail: jest.fn(async () => undefined) }));
jest.mock('../../src/config/env', () => ({ loadEnv: () => ({ WEB_ORIGIN: 'https://campushomes.test' }) }));

const pool = new Pool({ connectionString: testDatabaseUrl(), max: 5 });
const notify = jest.fn(async () => undefined);
const service = new CalendarReminderService(new RlsDb(pool), { notify } as unknown as NotificationsService);
const now = new Date('2026-10-18T09:00:00Z');
let eventId: string;

beforeAll(async () => {
  await pool.query('TRUNCATE users CASCADE');
  const user = (await pool.query(`INSERT INTO users (email, role, status, name)
    VALUES ('kato@example.test', 'student', 'active', 'Kato') RETURNING id`)).rows[0].id;
  eventId = (await pool.query(`INSERT INTO calendar_events (user_id, title, event_type, starts_at)
    VALUES ($1, 'Move in', 'event', $2) RETURNING id`, [user, new Date(now.getTime() + 20 * 60_000)])).rows[0].id;
});

afterAll(() => pool.end());

it('sends the due reminder once', async () => {
  expect(await service.run(now)).toBe(1);
});

it('records every overdue offset so none is sent again', async () => {
  const { rows } = await pool.query('SELECT reminders_sent FROM calendar_events WHERE id = $1', [eventId]);
  expect(rows[0].reminders_sent).toEqual([1440, 600, 300, 30]);
});

it('sends nothing on the next run in the same minute', async () => {
  expect(await service.run(now)).toBe(0);
});

it('links the in-app reminder to the student calendar', () => {
  expect(notify).toHaveBeenCalledWith(expect.any(String), 'calendar.reminder', 'in_app',
    expect.objectContaining({ href: '/calendar', message: 'Reminder: "Move in" starts in 20 minutes.' }));
});
