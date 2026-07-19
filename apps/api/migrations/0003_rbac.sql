CREATE TABLE "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_type" text NOT NULL,
	"requested_by" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"description" text NOT NULL,
	"requires_step_up" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"is_system" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "user_role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	"assigned_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_role_assignments_active_uk" ON "user_role_assignments" USING btree ("user_id","role_id","scope_type","scope_id") WHERE revoked_at IS NULL;

-- ── RLS: RBAC tables are service-role only; fine-grained enforcement is the
-- application-layer PermissionsGuard, same posture as accounts/verifications
-- (0002) — see docs/superpowers/specs/2026-07-19-rbac-foundation-design.md
-- "Enforcement". ────────────────────────────────────────────────────────────

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE user_role_assignments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY svc_all ON roles FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON permissions FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON role_permissions FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON user_role_assignments FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON approval_requests FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint

-- ── Grants ───────────────────────────────────────────────────────────────────
-- 0001's blanket GRANT predates these tables (Postgres GRANT ON ALL TABLES
-- only covers tables that exist at execution time) — same gap 0002 hit.

GRANT SELECT, INSERT, UPDATE ON roles, permissions, role_permissions, user_role_assignments, approval_requests TO app_user;
--> statement-breakpoint

-- ── Seed: 7 MVP roles ────────────────────────────────────────────────────────

INSERT INTO roles (key, name, description) VALUES
  ('super_admin', 'Super Admin', 'Emergency ownership and top-level governance. Max 2 active accounts recommended.'),
  ('platform_admin', 'Platform Admin', 'Ordinary platform configuration and internal staff access.'),
  ('ops_lead', 'Ops Lead', 'Landlord verification, inspections, and listing approval.'),
  ('ops_inspector', 'Ops Inspector', 'Conducts assigned property inspection visits.'),
  ('finance_admin', 'Finance Admin', 'Financial operations: payments, refunds, reconciliation.'),
  ('support_admin', 'Support Admin', 'Student/landlord support without elevated system power.'),
  ('auditor', 'Auditor', 'Read-only compliance and access review.');
--> statement-breakpoint

-- ── Seed: full permission catalog ───────────────────────────────────────────
-- Data only — enforcement this phase covers only the staff.*/roles.*/
-- audit.read subset via the new StaffModule; the rest is correct-but-inert
-- until a later phase retrofits its module (design doc "Explicitly deferred").

INSERT INTO permissions (key, description, requires_step_up) VALUES
  ('staff.read', 'View staff accounts', false),
  ('staff.invite', 'Invite a new staff account', false),
  ('staff.update', 'Update a staff account', false),
  ('staff.deactivate', 'Deactivate a staff account', true),
  ('roles.read', 'View roles and assignments', false),
  ('roles.assign', 'Assign a role to a staff member', true),
  ('roles.revoke', 'Revoke a role assignment', true),
  ('roles.manage_super_admin', 'Grant or revoke the super_admin role', true),
  ('students.read', 'View student records', false),
  ('students.verify', 'Verify a student record', false),
  ('students.flag', 'Flag a student', false),
  ('students.suspend', 'Suspend a student account', true),
  ('landlords.read', 'View landlord records', false),
  ('landlords.review_kyc', 'Review landlord KYC submissions', false),
  ('landlords.suspend', 'Suspend a landlord account', true),
  ('kyc_documents.read', 'View KYC document metadata via signed links', false),
  ('kyc_documents.download', 'Download a KYC document', true),
  ('properties.read', 'View property records', false),
  ('properties.update', 'Update a property record', false),
  ('properties.archive', 'Archive a property record', false),
  ('visits.read', 'View verification visits', false),
  ('visits.assign', 'Assign a verification visit to an inspector', false),
  ('visits.inspect', 'Submit inspection evidence for an assigned visit', false),
  ('visits.review', 'Review completed inspection evidence', false),
  ('listings.read', 'View listings', false),
  ('listings.publish', 'Publish a verified listing', false),
  ('listings.reject', 'Reject a listing submission', false),
  ('listings.suspend', 'Suspend a published listing', true),
  ('listing_versions.read', 'View listing version history', false),
  ('listing_versions.approve', 'Approve a listing version change', false),
  ('reservations.read', 'View reservations', false),
  ('reservations.support', 'Assist with a reservation as support', false),
  ('reservations.override', 'Override a reservation state', true),
  ('payments.read', 'View payment records', false),
  ('payments.reconcile', 'Reconcile provider transactions', false),
  ('payments.export', 'Export financial reports', true),
  ('refunds.read', 'View refund records', false),
  ('refunds.request', 'Request a refund', false),
  ('refunds.approve', 'Approve and execute a refund', true),
  ('refunds.retry', 'Retry a failed refund', true),
  ('disputes.read', 'View disputes', false),
  ('disputes.assign', 'Assign or escalate a dispute', false),
  ('disputes.resolve', 'Resolve a dispute outcome', true),
  ('strikes.read', 'View landlord strikes', false),
  ('strikes.issue', 'Issue a landlord strike', true),
  ('strikes.reverse', 'Reverse a landlord strike', true),
  ('accounts.suspend', 'Suspend any user account', true),
  ('reviews.read', 'View reviews', false),
  ('reviews.moderate', 'Moderate a review', false),
  ('chat.read_assigned', 'Read chat threads for assigned cases', false),
  ('chat.read_dispute', 'Read chat threads under an open dispute', false),
  ('notifications.read', 'View notification delivery status', false),
  ('notifications.resend', 'Resend a notification', false),
  ('templates.manage', 'Manage notification templates', false),
  ('analytics.read', 'View analytics dashboards', false),
  ('analytics.export', 'Export analytics reports', true),
  ('audit.read', 'View the audit log', false),
  ('audit.export', 'Export audit log records', true),
  ('semesters.manage', 'Manage semester configuration', false),
  ('universities.manage', 'Manage supported universities', false),
  ('settings.manage', 'Manage platform security/configuration settings', true),
  ('integrations.read', 'View integration status', false),
  ('integrations.manage', 'Manage integration credentials', true);
--> statement-breakpoint

-- ── Seed: role_permissions matrix ───────────────────────────────────────────

-- super_admin: every permission.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.key = 'super_admin';
--> statement-breakpoint

-- Every other role: explicit grant list.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  ('platform_admin','staff.read'), ('platform_admin','staff.invite'), ('platform_admin','staff.update'),
  ('platform_admin','staff.deactivate'), ('platform_admin','roles.read'), ('platform_admin','roles.assign'),
  ('platform_admin','students.read'), ('platform_admin','landlords.read'), ('platform_admin','properties.read'),
  ('platform_admin','visits.read'), ('platform_admin','listings.read'), ('platform_admin','listing_versions.read'),
  ('platform_admin','reservations.read'), ('platform_admin','payments.read'), ('platform_admin','refunds.read'),
  ('platform_admin','disputes.read'), ('platform_admin','strikes.read'), ('platform_admin','accounts.suspend'),
  ('platform_admin','reviews.read'), ('platform_admin','chat.read_assigned'), ('platform_admin','notifications.read'),
  ('platform_admin','notifications.resend'), ('platform_admin','templates.manage'), ('platform_admin','analytics.read'),
  ('platform_admin','analytics.export'), ('platform_admin','audit.read'), ('platform_admin','semesters.manage'),
  ('platform_admin','universities.manage'), ('platform_admin','settings.manage'), ('platform_admin','integrations.read'),
  ('platform_admin','integrations.manage'),

  ('ops_lead','landlords.read'), ('ops_lead','landlords.review_kyc'), ('ops_lead','landlords.suspend'),
  ('ops_lead','kyc_documents.read'), ('ops_lead','kyc_documents.download'), ('ops_lead','visits.read'),
  ('ops_lead','visits.assign'), ('ops_lead','visits.review'), ('ops_lead','listings.read'),
  ('ops_lead','listings.publish'), ('ops_lead','listings.reject'), ('ops_lead','listings.suspend'),
  ('ops_lead','listing_versions.read'), ('ops_lead','listing_versions.approve'), ('ops_lead','properties.read'),
  ('ops_lead','properties.update'), ('ops_lead','reservations.read'), ('ops_lead','payments.read'),
  ('ops_lead','refunds.read'), ('ops_lead','refunds.request'), ('ops_lead','refunds.approve'),
  ('ops_lead','disputes.read'), ('ops_lead','disputes.assign'), ('ops_lead','disputes.resolve'),
  ('ops_lead','strikes.read'), ('ops_lead','strikes.issue'), ('ops_lead','strikes.reverse'),
  ('ops_lead','reviews.read'), ('ops_lead','chat.read_dispute'), ('ops_lead','audit.read'),

  ('ops_inspector','visits.read'), ('ops_inspector','visits.inspect'), ('ops_inspector','properties.read'),

  ('finance_admin','payments.read'), ('finance_admin','payments.reconcile'), ('finance_admin','payments.export'),
  ('finance_admin','refunds.read'), ('finance_admin','refunds.approve'), ('finance_admin','refunds.retry'),
  ('finance_admin','reservations.read'), ('finance_admin','disputes.read'), ('finance_admin','audit.read'),

  ('support_admin','students.read'), ('support_admin','landlords.read'), ('support_admin','reservations.read'),
  ('support_admin','reservations.support'), ('support_admin','listings.read'), ('support_admin','notifications.read'),
  ('support_admin','notifications.resend'), ('support_admin','disputes.read'), ('support_admin','disputes.assign'),
  ('support_admin','chat.read_dispute'), ('support_admin','audit.read'),

  ('auditor','staff.read'), ('auditor','roles.read'), ('auditor','students.read'), ('auditor','landlords.read'),
  ('auditor','properties.read'), ('auditor','visits.read'), ('auditor','listings.read'), ('auditor','listing_versions.read'),
  ('auditor','reservations.read'), ('auditor','payments.read'), ('auditor','refunds.read'), ('auditor','disputes.read'),
  ('auditor','strikes.read'), ('auditor','reviews.read'), ('auditor','notifications.read'), ('auditor','analytics.read'),
  ('auditor','audit.read'), ('auditor','audit.export')
) AS grant_map(role_key, permission_key)
JOIN roles r ON r.key = grant_map.role_key
JOIN permissions p ON p.key = grant_map.permission_key;