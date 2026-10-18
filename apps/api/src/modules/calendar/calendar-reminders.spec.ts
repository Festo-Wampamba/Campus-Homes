import { calendarReminderContent } from '../auth/auth.email';
import { dueReminder, startsInLabel } from './calendar-reminders';

const now = new Date('2026-10-18T09:00:00Z');
const inMinutes = (m: number) => new Date(now.getTime() + m * 60_000);

describe('dueReminder', () => {
  it('sends nothing more than a day ahead', () => {
    expect(dueReminder(inMinutes(1441), now, [])).toBeNull();
  });

  it('sends the one-day reminder exactly a day ahead', () => {
    expect(dueReminder(inMinutes(1440), now, [])).toEqual({ offset: 1440, markSent: [1440] });
  });

  it('sends only the closest reminder when several are overdue, marking the rest sent', () => {
    expect(dueReminder(inMinutes(120), now, [])).toEqual({ offset: 300, markSent: [1440, 600, 300] });
  });

  it('never repeats a reminder already sent', () => {
    expect(dueReminder(inMinutes(29), now, [1440, 600, 300, 30])).toBeNull();
  });

  it('sends the last-minute reminder', () => {
    expect(dueReminder(inMinutes(1), now, [1440, 600, 300, 30, 15, 5])).toEqual({ offset: 1, markSent: [1] });
  });

  it('sends nothing once the event has started', () => {
    expect(dueReminder(now, now, [])).toBeNull();
  });
});

describe('startsInLabel', () => {
  it.each([
    [1440, 'in 1 day'],
    [600, 'in 10 hours'],
    [60, 'in 1 hour'],
    [30, 'in 30 minutes'],
    [1, 'in 1 minute'],
  ])('labels %i minutes as "%s"', (minutes, label) => {
    expect(startsInLabel(inMinutes(minutes), now)).toBe(label);
  });
});

describe('calendarReminderContent', () => {
  const email = calendarReminderContent({
    name: 'Kato', title: 'Student move-in', eventType: 'event', startsAt: new Date('2026-10-19T15:55:00Z'),
    allDay: false, startsIn: 'in 30 minutes', calendarUrl: 'https://campushomes.co.ug/calendar',
  });

  it('names the event and when it starts in the subject', () => {
    expect(email.subject).toBe('Reminder: Student move-in starts in 30 minutes');
  });

  it('shows the time in East Africa Time with am/pm', () => {
    expect(email.text).toContain('Monday 19 October, 6:55 pm EAT');
  });

  it('escapes the event title in HTML', () => {
    const html = calendarReminderContent({ name: null, title: '<b>x</b>', eventType: 'task', startsAt: now, allDay: true, startsIn: 'in 1 day' }).html;
    expect(html).not.toContain('<b>x</b>');
  });
});
