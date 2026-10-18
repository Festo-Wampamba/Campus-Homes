-- Calendar reminders: email + in-app at 1 day, 10 h, 5 h, 30, 15, 5 and
-- 1 minute before an event. `reminders_sent` records which offsets went out,
-- so the per-minute job never sends one twice.
ALTER TABLE calendar_events ADD COLUMN remind boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE calendar_events ADD COLUMN reminders_sent integer[] NOT NULL DEFAULT '{}'::integer[];
--> statement-breakpoint
-- Existing events whose reminder windows have already passed shouldn't all
-- fire at once on the first run: mark every offset that is already due.
UPDATE calendar_events
SET reminders_sent = ARRAY(
  SELECT o FROM unnest(ARRAY[1440, 600, 300, 30, 15, 5, 1]) AS o
  WHERE starts_at - make_interval(mins => o) <= now()
);
--> statement-breakpoint
CREATE INDEX calendar_events_reminder_due_idx ON calendar_events (starts_at) WHERE remind AND NOT done;
