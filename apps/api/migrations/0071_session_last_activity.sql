-- Inactivity sign-out: a session is rejected (and deleted) once
-- last_activity_at is older than IDLE_TIMEOUT_MS (packages/shared). Only an
-- explicit user-activity signal moves it, never background polling.
-- Existing sessions start their idle window at deploy time.
ALTER TABLE sessions ADD COLUMN last_activity_at timestamptz NOT NULL DEFAULT now();
