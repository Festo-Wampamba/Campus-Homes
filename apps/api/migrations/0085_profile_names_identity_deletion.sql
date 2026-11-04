-- Profile usernames are labels. UUIDs and verified contacts identify accounts.
DROP INDEX users_username_lower_uk;
--> statement-breakpoint
CREATE TABLE deleted_auth_identities (
  subject_hash text PRIMARY KEY,
  logto_user_id text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((logto_user_id IS NULL) = (completed_at IS NOT NULL))
);
CREATE INDEX deleted_auth_identities_pending ON deleted_auth_identities(last_attempt_at) WHERE completed_at IS NULL;
ALTER TABLE deleted_auth_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE deleted_auth_identities FORCE ROW LEVEL SECURITY;
CREATE POLICY svc_all ON deleted_auth_identities FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
GRANT SELECT, INSERT, UPDATE ON deleted_auth_identities TO app_user;
