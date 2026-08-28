-- Student inquiries (support desk): a question/report submitted from the
-- student portal, stored in the system and emailed to the ops/admin inbox.
-- Owner-scoped like calendar_events (0016) — students insert/read only their
-- own rows; staff access runs through service paths gated by new permission
-- keys inquiries.read/inquiries.resolve (PermissionsGuard is the real gate,
-- same posture as activities in 0017). Owner scope is SELECT/INSERT only —
-- see the policy split below for why UPDATE is granted yet still unreachable
-- for a student.
INSERT INTO permissions (key, description, requires_step_up) VALUES
  ('inquiries.resolve', 'Respond to and resolve student inquiries', false),
  ('inquiries.read', 'View all student inquiries', false)
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description, requires_step_up = EXCLUDED.requires_step_up;
--> statement-breakpoint

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  ('super_admin','inquiries.resolve'), ('super_admin','inquiries.read'),
  ('platform_admin','inquiries.resolve'), ('platform_admin','inquiries.read'),
  ('ops_lead','inquiries.resolve'), ('ops_lead','inquiries.read'),
  ('support_admin','inquiries.resolve'), ('support_admin','inquiries.read'),
  ('ops_inspector','inquiries.read'),
  ('finance_admin','inquiries.read'),
  ('auditor','inquiries.read')
) AS grant_map(role_key, permission_key)
JOIN roles r ON r.key = grant_map.role_key
JOIN permissions p ON p.key = grant_map.permission_key
ON CONFLICT DO NOTHING;
--> statement-breakpoint

CREATE TABLE "inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "inquiries_student_created_idx" ON "inquiries" USING btree ("student_id","created_at");
--> statement-breakpoint
CREATE INDEX "inquiries_status_created_idx" ON "inquiries" USING btree ("status","created_at");
--> statement-breakpoint
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY svc_all ON inquiries FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
-- Owner scope is split SELECT/INSERT deliberately: the staff resolve path
-- runs as app_user too (withRlsContext never SET ROLEs, it only flips the
-- app.user_role GUC), so UPDATE must be granted to app_user — and the ONLY
-- thing letting a student through would be a self-UPDATE policy, which is
-- exactly what we don't create. A student's UPDATE matches zero rows.
CREATE POLICY inquiries_self_select ON inquiries FOR SELECT
  USING (student_id = app_user_id());
--> statement-breakpoint
CREATE POLICY inquiries_self_insert ON inquiries FOR INSERT
  WITH CHECK (student_id = app_user_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON inquiries TO app_user;
