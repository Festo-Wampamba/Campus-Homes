-- Personal task/reminder calendar for every portal's dashboard. Scoped to
-- ownership only (not the calendar.manage_owned/manage_assigned/read_own
-- permission catalog seeded in 0013, which anticipates a shared per-property
-- crew calendar) — same posture as any other self-owned row: RLS filters at
-- read time, not app logic.
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"event_type" text DEFAULT 'task' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "calendar_events_user_starts_idx" ON "calendar_events" USING btree ("user_id","starts_at");
--> statement-breakpoint
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY svc_all ON calendar_events FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY calendar_events_self ON calendar_events FOR ALL
  USING (user_id = app_user_id())
  WITH CHECK (user_id = app_user_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON calendar_events TO app_user;
