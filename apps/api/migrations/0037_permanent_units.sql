-- Permanent rooms + per-semester pricing (2026-09 redesign, phase 2 of the
-- reservation overhaul started in 0034). Every publish previously created
-- brand-new units/beds from scratch — a landlord/ops was re-entering the
-- entire room list every semester for a physically unchanged building.
-- units now belong directly to a property and are reused across every
-- future semester; price/deposit move to a new per-(room, semester) table
-- so a landlord raising next semester's rent never rewrites what a current
-- tenant already locked in. reservations gain their own price snapshot for
-- the same reason — the live units join this used to rely on only "worked"
-- because units were never reused before now.

-- ── units: listing_id -> property_id ────────────────────────────────────
ALTER TABLE units ADD COLUMN property_id uuid;
--> statement-breakpoint
UPDATE units u
SET property_id = (SELECT l.property_id FROM listings l WHERE l.id = u.listing_id);
--> statement-breakpoint
ALTER TABLE units ALTER COLUMN property_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE units ADD CONSTRAINT "units_property_id_properties_id_fk"
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX "units_property_id_idx" ON units USING btree (property_id);
--> statement-breakpoint

-- ── unit_semester_pricing ────────────────────────────────────────────────
CREATE TABLE "unit_semester_pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"semester_id" uuid NOT NULL,
	"price_per_term_ugx" integer NOT NULL,
	"deposit_ugx" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "unit_semester_pricing" ADD CONSTRAINT "unit_semester_pricing_unit_id_units_id_fk"
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "unit_semester_pricing" ADD CONSTRAINT "unit_semester_pricing_semester_id_semesters_id_fk"
  FOREIGN KEY (semester_id) REFERENCES semesters(id);
--> statement-breakpoint
CREATE UNIQUE INDEX "unit_semester_pricing_unit_semester_uk" ON unit_semester_pricing USING btree (unit_id, semester_id);
--> statement-breakpoint
ALTER TABLE "unit_semester_pricing" ADD CONSTRAINT "unit_semester_pricing_price_chk" CHECK (price_per_term_ugx > 0);
--> statement-breakpoint
ALTER TABLE "unit_semester_pricing" ADD CONSTRAINT "unit_semester_pricing_deposit_chk" CHECK (deposit_ugx >= 0);
--> statement-breakpoint

-- Backfill: one pricing row per existing unit, from what it already has.
-- Every historical unit today is scoped to exactly one semester, so this is
-- exact, not a guess — the ambiguity/duplication only starts from here
-- forward, once the same physical room can be reused across semesters.
INSERT INTO unit_semester_pricing (unit_id, semester_id, price_per_term_ugx, deposit_ugx)
SELECT u.id, u.available_for_semester_id, u.price_per_term_ugx, u.deposit_ugx
FROM units u;
--> statement-breakpoint

-- ── reservations: price snapshot ────────────────────────────────────────
ALTER TABLE reservations ADD COLUMN price_per_term_ugx integer;
--> statement-breakpoint
ALTER TABLE reservations ADD COLUMN deposit_ugx integer;
--> statement-breakpoint
-- Backfill from the live unit price as it stands right now — safe only
-- because units have never been reused/repriced up to this point; this is
-- the last moment that live join is trustworthy.
UPDATE reservations r
SET price_per_term_ugx = u.price_per_term_ugx,
    deposit_ugx = u.deposit_ugx
FROM beds b, units u
WHERE b.id = r.bed_id AND u.id = b.unit_id;
--> statement-breakpoint
ALTER TABLE reservations ALTER COLUMN price_per_term_ugx SET NOT NULL;
--> statement-breakpoint

-- ── RLS: drop policies that depend on units.listing_id before dropping it ──
DROP POLICY units_read ON units;
--> statement-breakpoint
DROP POLICY units_landlord_operational_status_update ON units;
--> statement-breakpoint
DROP POLICY unit_photos_read ON unit_photos;
--> statement-breakpoint
DROP POLICY unit_photos_landlord_insert ON unit_photos;
--> statement-breakpoint
DROP POLICY unit_photos_landlord_delete ON unit_photos;
--> statement-breakpoint
DROP POLICY beds_read ON beds;
--> statement-breakpoint
DROP POLICY beds_landlord_blocked_update ON beds;
--> statement-breakpoint
DROP POLICY reservations_landlord_read ON reservations;
--> statement-breakpoint
DROP POLICY move_ins_read ON move_ins;
--> statement-breakpoint
DROP POLICY reservation_releases_landlord_read ON reservation_releases;
--> statement-breakpoint

-- ── units: drop the now-superseded columns ──────────────────────────────
ALTER TABLE units DROP CONSTRAINT IF EXISTS units_price_chk;
--> statement-breakpoint
ALTER TABLE units DROP CONSTRAINT IF EXISTS units_deposit_chk;
--> statement-breakpoint
ALTER TABLE units DROP COLUMN listing_id;
--> statement-breakpoint
ALTER TABLE units DROP COLUMN price_per_term_ugx;
--> statement-breakpoint
ALTER TABLE units DROP COLUMN deposit_ugx;
--> statement-breakpoint
ALTER TABLE units DROP COLUMN available_for_semester_id;
--> statement-breakpoint

-- ── RLS: recreate, joined via units.property_id directly ────────────────
ALTER TABLE unit_semester_pricing ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- 0030's force-RLS sweep only ran once, historically — it does not retroactively
-- cover tables created in later migrations, so this has to be explicit here.
ALTER TABLE unit_semester_pricing FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY svc_all ON unit_semester_pricing FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
-- Same "readable wherever the room is readable" shape as units_read below —
-- a semester's price is public once ops has published that semester's
-- listing for the room's property, or always visible to its own landlord/ops.
CREATE POLICY unit_semester_pricing_read ON unit_semester_pricing FOR SELECT
  USING (
    app_is_ops()
    OR EXISTS (
      SELECT 1 FROM units u
      WHERE u.id = unit_id
        AND (
          EXISTS (SELECT 1 FROM properties p WHERE p.id = u.property_id AND p.landlord_id = app_user_id())
          OR EXISTS (SELECT 1 FROM listings l
                     WHERE l.property_id = u.property_id AND l.semester_id = unit_semester_pricing.semester_id
                       AND l.status = 'verified')
        )
    )
  );
--> statement-breakpoint
CREATE POLICY unit_semester_pricing_ops_insert ON unit_semester_pricing FOR INSERT WITH CHECK (app_is_ops());
--> statement-breakpoint
GRANT SELECT, INSERT ON unit_semester_pricing TO app_user;
--> statement-breakpoint

-- units_read: a room is visible once ANY of the property's semesters has a
-- verified listing, or to its own landlord/ops — no longer scoped to "the"
-- listing since a room isn't owned by one anymore.
CREATE POLICY units_read ON units FOR SELECT
  USING (
    app_is_ops()
    OR EXISTS (SELECT 1 FROM properties p WHERE p.id = property_id AND p.landlord_id = app_user_id())
    OR EXISTS (SELECT 1 FROM listings l WHERE l.property_id = units.property_id AND l.status = 'verified')
  );
--> statement-breakpoint
CREATE POLICY units_landlord_operational_status_update ON units FOR UPDATE
  USING (EXISTS (SELECT 1 FROM properties p WHERE p.id = units.property_id AND p.landlord_id = app_user_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM properties p WHERE p.id = units.property_id AND p.landlord_id = app_user_id()));
--> statement-breakpoint

CREATE POLICY unit_photos_read ON unit_photos FOR SELECT
  USING (
    app_is_ops()
    OR EXISTS (
      SELECT 1 FROM units u
      WHERE u.id = unit_id
        AND (
          EXISTS (SELECT 1 FROM properties p WHERE p.id = u.property_id AND p.landlord_id = app_user_id())
          OR EXISTS (SELECT 1 FROM listings l WHERE l.property_id = u.property_id AND l.status = 'verified')
        )
    )
  );
--> statement-breakpoint
CREATE POLICY unit_photos_landlord_insert ON unit_photos FOR INSERT
  WITH CHECK (
    uploaded_by = app_user_id()
    AND EXISTS (
      SELECT 1 FROM units u
      JOIN properties p ON p.id = u.property_id
      WHERE u.id = unit_id AND p.landlord_id = app_user_id()
    )
  );
--> statement-breakpoint
CREATE POLICY unit_photos_landlord_delete ON unit_photos FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN properties p ON p.id = u.property_id
      WHERE u.id = unit_id AND p.landlord_id = app_user_id()
    )
  );
--> statement-breakpoint

CREATE POLICY beds_read ON beds FOR SELECT
  USING (
    app_is_ops()
    OR EXISTS (
      SELECT 1 FROM units u
      WHERE u.id = unit_id
        AND (
          EXISTS (SELECT 1 FROM properties p WHERE p.id = u.property_id AND p.landlord_id = app_user_id())
          OR EXISTS (SELECT 1 FROM listings l WHERE l.property_id = u.property_id AND l.status = 'verified')
        )
    )
  );
--> statement-breakpoint
CREATE POLICY beds_landlord_blocked_update ON beds FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN properties p ON p.id = u.property_id
      WHERE u.id = unit_id AND p.landlord_id = app_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM units u
      JOIN properties p ON p.id = u.property_id
      WHERE u.id = unit_id AND p.landlord_id = app_user_id()
    )
  );
--> statement-breakpoint

CREATE POLICY reservations_landlord_read ON reservations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM beds b
      JOIN units u ON u.id = b.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE b.id = bed_id AND p.landlord_id = app_user_id()
    )
  );
--> statement-breakpoint
CREATE POLICY move_ins_read ON move_ins FOR SELECT
  USING (
    app_is_lead()
    OR EXISTS (SELECT 1 FROM reservations r
               WHERE r.id = reservation_id AND r.student_id = app_user_id())
    OR EXISTS (
      SELECT 1 FROM reservations r
      JOIN beds b ON b.id = r.bed_id
      JOIN units u ON u.id = b.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE r.id = reservation_id AND p.landlord_id = app_user_id()
    )
  );
--> statement-breakpoint
CREATE POLICY reservation_releases_landlord_read ON reservation_releases FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM reservations r
      JOIN beds b ON b.id = r.bed_id
      JOIN units u ON u.id = b.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE r.id = reservation_id AND p.landlord_id = app_user_id()
    )
  );
