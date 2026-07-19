CREATE TABLE "unit_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "unit_photos" ADD CONSTRAINT "unit_photos_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_photos" ADD CONSTRAINT "unit_photos_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- RLS: same blanket setup as every post-0001 table (0002/0004/0005 pattern).
-- No UPDATE grant: a photo is added or removed, never edited in place.
GRANT SELECT, INSERT, DELETE ON unit_photos TO app_user;
--> statement-breakpoint
ALTER TABLE unit_photos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY svc_all ON unit_photos FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint

-- Landlord-uploaded per-room photos, distinct from Ops-captured
-- listing_photos. Read follows the exact same "public once verified, else
-- owner/ops" shape as listing_photos_read (0001); write is landlord-only
-- (units themselves stay Ops-only to write — this table is the landlord's
-- one write surface tied to a room they don't otherwise control).
CREATE POLICY unit_photos_read ON unit_photos FOR SELECT
  USING (
    app_is_ops()
    OR EXISTS (
      SELECT 1 FROM units u
      JOIN listings l ON l.id = u.listing_id
      WHERE u.id = unit_id
        AND (l.status = 'verified'
             OR EXISTS (SELECT 1 FROM properties p
                        WHERE p.id = l.property_id AND p.landlord_id = app_user_id()))
    )
  );
--> statement-breakpoint
CREATE POLICY unit_photos_landlord_insert ON unit_photos FOR INSERT
  WITH CHECK (
    uploaded_by = app_user_id()
    AND EXISTS (
      SELECT 1 FROM units u
      JOIN listings l ON l.id = u.listing_id
      JOIN properties p ON p.id = l.property_id
      WHERE u.id = unit_id AND p.landlord_id = app_user_id()
    )
  );
--> statement-breakpoint
CREATE POLICY unit_photos_landlord_delete ON unit_photos FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN listings l ON l.id = u.listing_id
      JOIN properties p ON p.id = l.property_id
      WHERE u.id = unit_id AND p.landlord_id = app_user_id()
    )
  );