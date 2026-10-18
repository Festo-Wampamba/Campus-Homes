/** Editing an event keeps its sent reminders unless the start time moves. */
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import { CalendarService } from '../../src/modules/calendar/calendar.service';
import { testDatabaseUrl } from '../test-database-url';

const pool = new Pool({ connectionString: testDatabaseUrl(), max: 5 });
const calendar = new CalendarService(new RlsDb(pool));
const start = '2026-11-01T10:00:00.000Z';
const email = 'edit-reminders@example.test';
let ctx: { userId: string; role: 'student' };
let id: string;

beforeAll(async () => {
  const user = (await pool.query(`INSERT INTO users (email, role, status, name)
    VALUES ($1, 'student', 'active', 'Edit') RETURNING id`, [email])).rows[0].id;
  ctx = { userId: user, role: 'student' };
  id = (await pool.query(`INSERT INTO calendar_events (user_id, title, starts_at, reminders_sent)
    VALUES ($1, 'Visit', $2, '{1440,600}') RETURNING id`, [user, start])).rows[0].id;
});

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE email = $1', [email]);
  await pool.end();
});

const sentFor = async () =>
  (await pool.query('SELECT reminders_sent FROM calendar_events WHERE id = $1', [id])).rows[0].reminders_sent;

it('keeps sent reminders when only the title changes', async () => {
  await calendar.update(ctx, id, { title: 'Property visit', startsAt: start });
  expect(await sentFor()).toEqual([1440, 600]);
});

it('starts reminders afresh when the start time moves', async () => {
  await calendar.update(ctx, id, { startsAt: '2026-11-02T10:00:00.000Z' });
  expect(await sentFor()).toEqual([]);
});
