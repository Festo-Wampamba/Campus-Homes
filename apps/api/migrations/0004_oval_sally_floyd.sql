CREATE TABLE "campus_photos" (
	"university" "university" PRIMARY KEY NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campus_photos" ADD CONSTRAINT "campus_photos_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "catchment" "university";
--> statement-breakpoint
-- Backfill existing rows (dev/seed data only — no production properties
-- exist yet) so the column can go NOT NULL below. The launch catchment has
-- been Makerere-only so far (seed-dev.cjs, listings-map.tsx INITIAL_CENTER).
UPDATE "properties" SET "catchment" = 'MUK' WHERE "catchment" IS NULL;
--> statement-breakpoint
ALTER TABLE "properties" ALTER COLUMN "catchment" SET NOT NULL;
--> statement-breakpoint

-- RLS: 0001's blanket GRANT/ENABLE/svc_all predates this table (same pattern
-- as 0002's Better Auth tables) — repeat it here.
GRANT SELECT, INSERT, UPDATE ON campus_photos TO app_user;
--> statement-breakpoint
ALTER TABLE campus_photos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY svc_all ON campus_photos FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint

-- Public read (it's landing-page decoration, same trust level as a verified
-- listing's name/address) — Ops-only write, same shape as units_ops_insert/update.
CREATE POLICY campus_photos_read ON campus_photos FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY campus_photos_ops_insert ON campus_photos FOR INSERT WITH CHECK (app_is_ops());
--> statement-breakpoint
CREATE POLICY campus_photos_ops_update ON campus_photos FOR UPDATE
  USING (app_is_ops()) WITH CHECK (app_is_ops());
