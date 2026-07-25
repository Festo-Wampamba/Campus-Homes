-- Shared ops "activities" board — the staff-facing counterpart to the
-- personal calendar_events table (0016): admin/ops create activities and
-- assign them to any staff member, see everyone's, track status. New
-- permission keys (activities.manage/activities.read) rather than the
-- calendar.manage_owned/manage_assigned/read_own catalog from 0013 — those
-- are property-ownership scoped (landlord/custodian/property_worker) and
-- don't fit "assign to any staff member" semantics. Same posture as
-- roles/staff tables: svc_all-only RLS, PermissionsGuard is the real gate,
-- service_role does the write after the guard passes.
INSERT INTO permissions (key, description, requires_step_up) VALUES
  ('activities.manage', 'Create, edit, assign, and delete platform activities', false),
  ('activities.read', 'View all platform activities', false)
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description, requires_step_up = EXCLUDED.requires_step_up;
--> statement-breakpoint

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  ('super_admin','activities.manage'), ('super_admin','activities.read'),
  ('platform_admin','activities.manage'), ('platform_admin','activities.read'),
  ('ops_lead','activities.manage'), ('ops_lead','activities.read'),
  ('ops_inspector','activities.read'),
  ('finance_admin','activities.read'),
  ('support_admin','activities.read'),
  ('auditor','activities.read')
) AS grant_map(role_key, permission_key)
JOIN roles r ON r.key = grant_map.role_key
JOIN permissions p ON p.key = grant_map.permission_key
ON CONFLICT DO NOTHING;
--> statement-breakpoint

CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"activity_type" text DEFAULT 'task' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"assigned_to" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "activities_starts_idx" ON "activities" USING btree ("starts_at");
--> statement-breakpoint
CREATE INDEX "activities_assigned_idx" ON "activities" USING btree ("assigned_to");
--> statement-breakpoint
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY svc_all ON activities FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON activities TO app_user;
