-- Road distance and drive time from a hostel to its campus (Google Routes,
-- fastest driving route). Computed once per property + campus and reused;
-- recomputed only when either end's coordinates change (origin/dest stored
-- for that check). svc_all-only RLS: ListingsService reads and writes it
-- under service_role; a public or student context matches zero rows.
CREATE TABLE "property_campus_routes" (
	"property_id" uuid NOT NULL,
	"university" "university" NOT NULL,
	"origin_lat" double precision NOT NULL,
	"origin_lon" double precision NOT NULL,
	"dest_lat" double precision NOT NULL,
	"dest_lon" double precision NOT NULL,
	"distance_m" integer NOT NULL CHECK ("distance_m" >= 0),
	"duration_s" integer NOT NULL CHECK ("duration_s" >= 0),
	"provider" text DEFAULT 'google_routes' NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	PRIMARY KEY ("property_id", "university")
);
--> statement-breakpoint
ALTER TABLE "property_campus_routes" ADD CONSTRAINT "property_campus_routes_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE property_campus_routes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE property_campus_routes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY svc_all ON property_campus_routes FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON property_campus_routes TO app_user;
