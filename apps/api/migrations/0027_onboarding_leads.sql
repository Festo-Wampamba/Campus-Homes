-- Lead capture for the public /landlords "Request onboarding" CTA — was a
-- mailto: link with zero backend trace; a remote landlord's email could sit
-- unread with no record anyone ever asked. Public INSERT with no
-- authentication (the whole point: a prospective landlord has no account
-- yet), so writes go through service_role from the API layer rather than a
-- public RLS policy — same posture already used for other pre-account
-- writes in this codebase. Ops reads/updates the queue under their own ctx.
CREATE TABLE IF NOT EXISTS onboarding_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  property_location text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'new',
  contacted_by uuid REFERENCES users(id),
  contacted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE onboarding_leads DROP CONSTRAINT IF EXISTS onboarding_leads_status_check;
--> statement-breakpoint
ALTER TABLE onboarding_leads ADD CONSTRAINT onboarding_leads_status_check
  CHECK (status IN ('new', 'contacted', 'converted', 'dismissed'));
--> statement-breakpoint
ALTER TABLE onboarding_leads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY svc_all ON onboarding_leads FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY onboarding_leads_ops_read ON onboarding_leads FOR SELECT USING (app_is_ops());
--> statement-breakpoint
CREATE POLICY onboarding_leads_ops_update ON onboarding_leads FOR UPDATE
  USING (app_is_ops()) WITH CHECK (app_is_ops());
--> statement-breakpoint
-- INSERT is granted at the table level like every other table (0001's
-- blanket GRANT ... ON ALL TABLES), but the svc_all policy is the only one
-- that admits an INSERT — app_is_service() must be true, so this table
-- still can't be written by a client-derived (student/landlord/ops)
-- session, only the server's own service_role-flagged requests.
GRANT SELECT, INSERT, UPDATE ON onboarding_leads TO app_user;
