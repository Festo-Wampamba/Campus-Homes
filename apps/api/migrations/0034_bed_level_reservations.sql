-- Bed-level reservation redesign (2026-09 sponsor-approved business doc):
-- Reserve -> Book -> Move-in, replacing the payment-driven
-- held/payment_pending/fulfilled machine, and moving inventory from
-- room-level to bed-level so a partially-let double/triple still shows its
-- free beds instead of the whole room disappearing.

-- ── beds ──────────────────────────────────────────────────────────────────
CREATE TABLE "beds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"label" text NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"blocked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "beds" ADD CONSTRAINT "beds_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE CASCADE ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "beds_unit_id_idx" ON "beds" USING btree ("unit_id");
--> statement-breakpoint

-- Backfill: one bed per occupancy position already implied by each unit's
-- existing capacity — "Bed 1".."Bed N".
INSERT INTO beds (unit_id, label)
SELECT u.id, 'Bed ' || gs.n
FROM units u, generate_series(1, u.capacity) AS gs(n);
--> statement-breakpoint

-- ── reservations: unit_id -> bed_id ──────────────────────────────────────
ALTER TABLE reservations ADD COLUMN bed_id uuid;
--> statement-breakpoint
-- Old model was room-level — every existing reservation maps onto its
-- unit's first bed (deterministic by label, "Bed 1" sorts first).
UPDATE reservations r
SET bed_id = (
  SELECT b.id FROM beds b WHERE b.unit_id = r.unit_id ORDER BY b.label LIMIT 1
);
--> statement-breakpoint
ALTER TABLE reservations ALTER COLUMN bed_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE reservations ADD CONSTRAINT "reservations_bed_id_beds_id_fk" FOREIGN KEY ("bed_id") REFERENCES "public"."beds"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
DROP INDEX IF EXISTS "reservations_one_live_hold_per_unit";
--> statement-breakpoint
-- These two policies (0001) read reservations.unit_id directly — must drop
-- them before the column, or Postgres refuses (dependent objects). Recreated
-- bed-based further down in the RLS section.
DROP POLICY reservations_landlord_read ON reservations;
--> statement-breakpoint
DROP POLICY move_ins_read ON move_ins;
--> statement-breakpoint
ALTER TABLE reservations DROP COLUMN unit_id;
--> statement-breakpoint

-- reviews_student_insert (0001) reads reservations.status directly — must
-- drop before the column, same reasoning as above. Recreated further down
-- with 'occupied' replacing 'fulfilled' (a review should require the
-- student to have actually moved in under the new state machine).
DROP POLICY reviews_student_insert ON reviews;
--> statement-breakpoint

-- ── reservations: status enum, held/payment_pending/fulfilled -> reserved/booked/occupied ──
-- Staged through a plain text column first — no correlated-subquery
-- gymnastics inside an ALTER COLUMN ... USING expression.
ALTER TABLE reservations ADD COLUMN status_migrated text;
--> statement-breakpoint
UPDATE reservations SET status_migrated = CASE status::text
  WHEN 'held' THEN 'reserved'
  WHEN 'payment_pending' THEN 'reserved'
  WHEN 'payment_failed' THEN 'reserved'
  WHEN 'fulfilled' THEN (
    CASE WHEN EXISTS (SELECT 1 FROM move_ins m WHERE m.reservation_id = reservations.id)
      THEN 'occupied' ELSE 'booked' END
  )
  WHEN 'cancelled' THEN 'cancelled'
  WHEN 'refunded' THEN 'refunded'
  WHEN 'expired' THEN 'expired'
  ELSE 'reserved'
END;
--> statement-breakpoint
ALTER TABLE reservations DROP COLUMN status;
--> statement-breakpoint
DROP TYPE reservation_status;
--> statement-breakpoint
CREATE TYPE "reservation_status" AS ENUM ('reserved', 'booked', 'occupied', 'released', 'expired', 'cancelled', 'refunded');
--> statement-breakpoint
ALTER TABLE reservations ADD COLUMN status reservation_status;
--> statement-breakpoint
UPDATE reservations SET status = status_migrated::reservation_status;
--> statement-breakpoint
ALTER TABLE reservations ALTER COLUMN status SET NOT NULL;
--> statement-breakpoint
ALTER TABLE reservations ALTER COLUMN status SET DEFAULT 'reserved';
--> statement-breakpoint
ALTER TABLE reservations DROP COLUMN status_migrated;
--> statement-breakpoint

-- ── reservations: payment-gate fields out, Book/Release fields in ───────
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_fee_chk;
--> statement-breakpoint
ALTER TABLE reservations DROP COLUMN fee_amount_ugx;
--> statement-breakpoint
ALTER TABLE reservations DROP COLUMN cooling_off_expires_at;
--> statement-breakpoint
ALTER TABLE reservations RENAME COLUMN hold_starts_at TO reserved_at;
--> statement-breakpoint
ALTER TABLE reservations RENAME COLUMN hold_expires_at TO reserved_expires_at;
--> statement-breakpoint
ALTER TABLE reservations ADD COLUMN "booked_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE reservations ADD COLUMN "booked_by" uuid;
--> statement-breakpoint
ALTER TABLE reservations ADD CONSTRAINT "reservations_booked_by_users_id_fk" FOREIGN KEY ("booked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE reservations ADD COLUMN "booking_fee_expected_ugx" integer;
--> statement-breakpoint
ALTER TABLE reservations ADD COLUMN "booking_fee_collected_ugx" integer;
--> statement-breakpoint
ALTER TABLE reservations ADD COLUMN "deposit_collected_ugx" integer;
--> statement-breakpoint
ALTER TABLE reservations ADD COLUMN "payment_method" payment_method;
--> statement-breakpoint
ALTER TABLE reservations ADD COLUMN "payment_recorded_at" timestamp with time zone;
--> statement-breakpoint
-- Best-effort backfill so existing booked/occupied rows aren't left with a
-- null bookedAt in the UI — the real historical timestamp isn't recoverable,
-- created_at is the closest available proxy.
UPDATE reservations SET booked_at = created_at WHERE status IN ('booked', 'occupied');
--> statement-breakpoint

-- THE double-booking lock, bed-scoped, covering all three live states —
-- an occupied bed must still reject a second reservation row.
CREATE UNIQUE INDEX "reservations_one_live_hold_per_bed" ON reservations USING btree ("bed_id") WHERE status IN ('reserved', 'booked', 'occupied');
--> statement-breakpoint

-- ── reservation_releases ─────────────────────────────────────────────────
CREATE TABLE "reservation_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"released_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"refund_required" boolean DEFAULT false NOT NULL,
	"refund_status" refund_status,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservation_releases" ADD CONSTRAINT "reservation_releases_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reservation_releases" ADD CONSTRAINT "reservation_releases_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE beds ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE reservation_releases ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY svc_all ON beds FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON reservation_releases FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint

-- beds: readable wherever the parent unit is readable (same shape as
-- units_read, 0001).
CREATE POLICY beds_read ON beds FOR SELECT
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
CREATE POLICY beds_ops_insert ON beds FOR INSERT WITH CHECK (app_is_ops());
--> statement-breakpoint
CREATE POLICY beds_ops_update ON beds FOR UPDATE
  USING (app_is_ops()) WITH CHECK (app_is_ops());
--> statement-breakpoint
-- Landlord's one write lever on a bed they don't otherwise control — same
-- column-restricted-grant pattern as units.operational_status (0024).
CREATE POLICY beds_landlord_blocked_update ON beds FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN listings l ON l.id = u.listing_id
      JOIN properties p ON p.id = l.property_id
      WHERE u.id = unit_id AND p.landlord_id = app_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM units u
      JOIN listings l ON l.id = u.listing_id
      JOIN properties p ON p.id = l.property_id
      WHERE u.id = unit_id AND p.landlord_id = app_user_id()
    )
  );
--> statement-breakpoint

GRANT SELECT, INSERT ON beds TO app_user;
--> statement-breakpoint
GRANT UPDATE (blocked, blocked_reason) ON beds TO app_user;
--> statement-breakpoint
-- Append-only, mirrors the landlord_strikes/student_flags/listing_photos
-- posture (CLAUDE.md: audit-style tables keep UPDATE ungranted).
GRANT SELECT, INSERT ON reservation_releases TO app_user;
--> statement-breakpoint

CREATE POLICY reservation_releases_landlord_read ON reservation_releases FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM reservations r
      JOIN beds b ON b.id = r.bed_id
      JOIN units u ON u.id = b.unit_id
      JOIN listings l ON l.id = u.listing_id
      JOIN properties p ON p.id = l.property_id
      WHERE r.id = reservation_id AND p.landlord_id = app_user_id()
    )
  );
--> statement-breakpoint
CREATE POLICY reservation_releases_lead_read ON reservation_releases FOR SELECT
  USING (app_is_lead());
--> statement-breakpoint

-- reservations_landlord_read / move_ins_read: rejoin through beds now that
-- reservations no longer has unit_id directly. Both DROP POLICYs already
-- happened earlier, before unit_id itself was dropped (Postgres refuses to
-- drop a column a policy still depends on).
CREATE POLICY reservations_landlord_read ON reservations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM beds b
      JOIN units u ON u.id = b.unit_id
      JOIN listings l ON l.id = u.listing_id
      JOIN properties p ON p.id = l.property_id
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
      JOIN listings l ON l.id = u.listing_id
      JOIN properties p ON p.id = l.property_id
      WHERE r.id = reservation_id AND p.landlord_id = app_user_id()
    )
  );
--> statement-breakpoint

-- 'fulfilled' -> 'occupied': a review now requires the student to have
-- actually moved in (occupied is the new first-class status for that),
-- not merely that the reservation was confirmed/paid.
CREATE POLICY reviews_student_insert ON reviews FOR INSERT
  WITH CHECK (
    student_id = app_user_id()
    AND EXISTS (SELECT 1 FROM reservations r
                WHERE r.id = reservation_id
                  AND r.student_id = app_user_id()
                  AND r.status = 'occupied')
  );
--> statement-breakpoint

-- enforce_review_eligibility (0001) is a defense-in-depth trigger separate
-- from the RLS policy above (fires for service-role paths too) — same
-- 'fulfilled' -> 'occupied' update, or every review insert throws
-- "invalid input value for enum reservation_status" the moment the old
-- literal is compared against a column that can no longer hold it.
CREATE OR REPLACE FUNCTION enforce_review_eligibility() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM reservations r
    WHERE r.id = NEW.reservation_id
      AND r.status = 'occupied'
      AND r.student_id = NEW.student_id
  ) THEN
    RAISE EXCEPTION 'review requires an occupied reservation owned by the reviewing student'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
