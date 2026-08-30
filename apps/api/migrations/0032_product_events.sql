-- Lightweight event backstop for the live-pilot daily funnel (MVP testing
-- workbook Form 11: "suitable listing views", the search step feeding it).
-- Deliberately NOT a general analytics platform — two event types only,
-- written from ListingsService.search()/detail(), read back by
-- AdminDashboardService.reports() for a pilot-funnel summary. Enquiries and
-- landlord responses already come from `inquiries` (0031); reservations
-- already come from `reservations` — no event needed for either.
CREATE TABLE "product_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"actor_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_events" ADD CONSTRAINT "product_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "product_events_type_created_idx" ON "product_events" USING btree ("event_type","created_at");
--> statement-breakpoint
ALTER TABLE product_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- svc_all only: both write sites (ListingsService.search()/detail()) already
-- run their event insert under SERVICE_CTX (detail()'s happens in the same
-- service_role block that already computes availability/property, added
-- sequentially via .then() after the public PUBLIC_CTX block closes — not
-- nested inside it). No client ever needs to read its own event rows, so
-- there's no self-select policy either — same posture as activities/roles.
-- withRlsContext never SET ROLEs (every context is the literal app_user
-- Postgres role, differentiated only by the app.user_role GUC), so the base
-- GRANT is still required even for the service_role-ctx path.
CREATE POLICY svc_all ON product_events FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
GRANT SELECT, INSERT ON product_events TO app_user;
