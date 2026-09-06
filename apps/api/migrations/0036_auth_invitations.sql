-- Durable staff enrollment. Identity credentials remain exclusively in Logto.
-- No reset, role rewrite, or migration journal edit belongs in this migration.
CREATE TABLE auth_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  role_key text NOT NULL REFERENCES roles(key),
  scope_type text NOT NULL CHECK (scope_type IN ('platform_wide', 'catchment')),
  scope_id text,
  valid_until timestamptz,
  reason text NOT NULL,
  invited_by uuid NOT NULL REFERENCES users(id),
  target_user_id uuid REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'cancelled')),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES users(id),
  assignment_id uuid REFERENCES user_role_assignments(id),
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES users(id),
  delivery_attempts integer NOT NULL DEFAULT 0 CHECK (delivery_attempts >= 0),
  last_delivery_attempt_at timestamptz,
  delivered_at timestamptz,
  last_delivery_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR phone IS NOT NULL),
  CHECK (email IS NULL OR (email = lower(btrim(email)) AND length(email) > 0)),
  CHECK ((scope_type = 'platform_wide' AND scope_id IS NULL) OR (scope_type = 'catchment' AND scope_id IS NOT NULL)),
  CHECK ((status = 'accepted') = (accepted_at IS NOT NULL AND accepted_by IS NOT NULL AND assignment_id IS NOT NULL)),
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX auth_invitations_pending_uk ON auth_invitations
  (email, phone, role_key, scope_type, scope_id) NULLS NOT DISTINCT WHERE status = 'pending';
--> statement-breakpoint
CREATE INDEX auth_invitations_email_pending_idx ON auth_invitations(email) WHERE status = 'pending';
--> statement-breakpoint
CREATE INDEX auth_invitations_phone_pending_idx ON auth_invitations(phone) WHERE status = 'pending';
--> statement-breakpoint
ALTER TABLE auth_invitations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE auth_invitations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY svc_all ON auth_invitations FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON auth_invitations TO app_user;
