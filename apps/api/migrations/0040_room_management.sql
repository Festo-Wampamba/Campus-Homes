-- Property-scoped room management. Existing units/beds remain the physical
-- inventory; these tables add reusable type specifications, governed change
-- sets, and auditable operational blocks.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
CREATE TABLE room_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  current_version_id uuid,
  created_by uuid NOT NULL REFERENCES users(id),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX room_types_property_idx ON room_types(property_id);
--> statement-breakpoint
CREATE TABLE room_inventory_change_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  semester_id uuid NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','visit_required','approved','rejected','cancelled')),
  submitted_by uuid NOT NULL REFERENCES users(id),
  submitted_at timestamptz,
  submission_notes text,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  reviewer_notes text,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX room_change_sets_one_open_uk
  ON room_inventory_change_sets(property_id, semester_id)
  WHERE status IN ('draft','pending_review','visit_required','rejected');
--> statement-breakpoint
CREATE INDEX room_change_sets_property_status_idx ON room_inventory_change_sets(property_id, status);
--> statement-breakpoint
CREATE INDEX room_change_sets_review_queue_idx ON room_inventory_change_sets(status, submitted_at);
--> statement-breakpoint
CREATE TABLE room_type_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_type_id uuid NOT NULL REFERENCES room_types(id) ON DELETE RESTRICT,
  change_set_id uuid REFERENCES room_inventory_change_sets(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number > 0),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  category text NOT NULL CHECK (category IN ('single','double','triple','quad','studio','self_contained','bedsitter','dormitory','other')),
  bathroom_type text NOT NULL DEFAULT 'unspecified' CHECK (bathroom_type IN ('ensuite','shared','private_external','unspecified')),
  capacity smallint NOT NULL CHECK (capacity BETWEEN 1 AND 20),
  size_sqm integer CHECK (size_sqm > 0),
  description text,
  amenities jsonb NOT NULL DEFAULT '[]'::jsonb,
  semester_id uuid NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT,
  price_per_term_ugx integer NOT NULL CHECK (price_per_term_ugx > 0),
  deposit_ugx integer CHECK (deposit_ugx >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','visit_required','approved','rejected')),
  submitted_at timestamptz,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  reviewer_notes text,
  rejection_reason text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(room_type_id, version_number)
);
--> statement-breakpoint
CREATE INDEX room_type_versions_change_set_idx ON room_type_versions(change_set_id);
--> statement-breakpoint
ALTER TABLE room_types ADD CONSTRAINT room_types_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES room_type_versions(id) ON DELETE RESTRICT;
--> statement-breakpoint
CREATE TABLE room_type_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_type_version_id uuid NOT NULL REFERENCES room_type_versions(id) ON DELETE CASCADE,
  storage_key text NOT NULL CHECK (char_length(storage_key) BETWEEN 1 AND 500),
  sort_order smallint NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9),
  is_primary boolean NOT NULL DEFAULT false,
  uploaded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(room_type_version_id, storage_key)
);
--> statement-breakpoint
CREATE INDEX room_type_photos_version_order_idx ON room_type_photos(room_type_version_id, sort_order);
--> statement-breakpoint
CREATE UNIQUE INDEX room_type_photos_one_primary_uk ON room_type_photos(room_type_version_id) WHERE is_primary;
--> statement-breakpoint
CREATE TABLE room_unit_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_set_id uuid NOT NULL REFERENCES room_inventory_change_sets(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('create','update','archive','capacity_change')),
  unit_id uuid REFERENCES units(id) ON DELETE RESTRICT,
  room_type_id uuid REFERENCES room_types(id) ON DELETE RESTRICT,
  proposed_data jsonb NOT NULL,
  idempotency_key text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX room_unit_changes_change_set_idx ON room_unit_changes(change_set_id);
--> statement-breakpoint
CREATE UNIQUE INDEX room_unit_changes_idempotency_uk ON room_unit_changes(idempotency_key) WHERE idempotency_key IS NOT NULL;
--> statement-breakpoint
CREATE TABLE unit_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (reason IN ('maintenance','renovation','damaged_utilities','offline_allocation','safety','owner_hold','other')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  notes text,
  created_by uuid NOT NULL REFERENCES users(id),
  cleared_at timestamptz,
  cleared_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);
--> statement-breakpoint
ALTER TABLE unit_blocks ADD CONSTRAINT unit_blocks_no_overlap
  EXCLUDE USING gist (
    unit_id WITH =,
    tstzrange(starts_at, COALESCE(ends_at, 'infinity'::timestamptz), '[)') WITH &&
  ) WHERE (cleared_at IS NULL);
--> statement-breakpoint
CREATE INDEX unit_blocks_unit_active_idx ON unit_blocks(unit_id, starts_at, ends_at);
--> statement-breakpoint
ALTER TABLE units ADD COLUMN room_type_id uuid REFERENCES room_types(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE units ADD COLUMN archived_at timestamptz;
--> statement-breakpoint
ALTER TABLE beds ADD COLUMN retired_at timestamptz;
--> statement-breakpoint

-- Existing inventory is grouped into approved room types using its current
-- category, capacity and most recent semester price. Unknown specification
-- fields remain explicitly unspecified for landlord completion.
CREATE TEMP TABLE room_type_backfill ON COMMIT DROP AS
SELECT DISTINCT ON (u.property_id, u.room_category, u.capacity, latest.price_per_term_ugx, latest.deposit_ugx)
  gen_random_uuid() AS room_type_id,
  gen_random_uuid() AS version_id,
  u.property_id,
  u.room_category::text AS category,
  u.capacity,
  latest.semester_id,
  latest.price_per_term_ugx,
  latest.deposit_ugx,
  p.landlord_id AS created_by
FROM units u
JOIN properties p ON p.id = u.property_id
JOIN LATERAL (
  SELECT usp.semester_id, usp.price_per_term_ugx, usp.deposit_ugx
  FROM unit_semester_pricing usp
  JOIN semesters s ON s.id = usp.semester_id
  WHERE usp.unit_id = u.id
  ORDER BY s.starts_on DESC, usp.created_at DESC
  LIMIT 1
) latest ON true;
--> statement-breakpoint
INSERT INTO room_types(id, property_id, created_by)
SELECT room_type_id, property_id, created_by FROM room_type_backfill;
--> statement-breakpoint
INSERT INTO room_type_versions(
  id, room_type_id, version_number, title, category, bathroom_type,
  capacity, amenities, semester_id, price_per_term_ugx, deposit_ugx,
  status, submitted_at, reviewed_at, created_by
)
SELECT version_id, room_type_id, 1,
  initcap(replace(category, '_', ' ')) || ' Room', category, 'unspecified',
  capacity, '[]'::jsonb, semester_id, price_per_term_ugx, deposit_ugx,
  'approved', now(), now(), created_by
FROM room_type_backfill;
--> statement-breakpoint
UPDATE room_types rt SET current_version_id = b.version_id
FROM room_type_backfill b WHERE b.room_type_id = rt.id;
--> statement-breakpoint
WITH latest_by_unit AS (
  SELECT DISTINCT ON (usp.unit_id)
    usp.unit_id,
    usp.price_per_term_ugx,
    usp.deposit_ugx
  FROM unit_semester_pricing usp
  JOIN semesters s ON s.id = usp.semester_id
  ORDER BY usp.unit_id, s.starts_on DESC, usp.created_at DESC
)
UPDATE units u SET room_type_id = b.room_type_id
FROM room_type_backfill b
JOIN latest_by_unit latest
  ON latest.price_per_term_ugx = b.price_per_term_ugx
 AND latest.deposit_ugx IS NOT DISTINCT FROM b.deposit_ugx
WHERE latest.unit_id = u.id
  AND u.property_id = b.property_id
  AND u.room_category::text = b.category
  AND u.capacity = b.capacity;
--> statement-breakpoint
CREATE INDEX units_room_type_idx ON units(room_type_id);
--> statement-breakpoint

-- Backfill a small approved gallery per generated version while retaining
-- every original unit photo for compatibility/fallback.
INSERT INTO room_type_photos(room_type_version_id, storage_key, sort_order, is_primary, uploaded_by)
SELECT x.version_id, x.storage_key, x.rn - 1, x.rn = 1, x.uploaded_by
FROM (
  SELECT DISTINCT ON (rtv.id, up.storage_key)
    rtv.id AS version_id, up.storage_key, up.uploaded_by,
    row_number() OVER (PARTITION BY rtv.id ORDER BY up.sort_order, up.created_at) AS rn
  FROM room_type_versions rtv
  JOIN room_types rt ON rt.id = rtv.room_type_id
  JOIN units u ON u.room_type_id = rt.id
  JOIN unit_photos up ON up.unit_id = u.id
  WHERE rtv.status = 'approved'
) x WHERE x.rn <= 10;
--> statement-breakpoint

ALTER TABLE room_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_types FORCE ROW LEVEL SECURITY;
ALTER TABLE room_type_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_type_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE room_type_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_type_photos FORCE ROW LEVEL SECURITY;
ALTER TABLE room_inventory_change_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_inventory_change_sets FORCE ROW LEVEL SECURITY;
ALTER TABLE room_unit_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_unit_changes FORCE ROW LEVEL SECURITY;
ALTER TABLE unit_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_blocks FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY svc_all ON room_types FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
CREATE POLICY svc_all ON room_type_versions FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
CREATE POLICY svc_all ON room_type_photos FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
CREATE POLICY svc_all ON room_inventory_change_sets FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
CREATE POLICY svc_all ON room_unit_changes FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
CREATE POLICY svc_all ON unit_blocks FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
-- The established Ops listing-publish transaction also creates approved
-- room types for newly entered physical rooms. Keep that transaction atomic
-- under its real reviewer identity; landlord mutations still flow through
-- service-validated drafts and cannot use these policies.
CREATE POLICY room_types_ops_insert ON room_types FOR INSERT WITH CHECK (app_staff_scope(property_id, true));
CREATE POLICY room_types_ops_update ON room_types FOR UPDATE USING (app_staff_scope(property_id, true)) WITH CHECK (app_staff_scope(property_id, true));
CREATE POLICY room_type_versions_ops_insert ON room_type_versions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM room_types rt WHERE rt.id=room_type_id AND app_staff_scope(rt.property_id, true))
);
--> statement-breakpoint
CREATE POLICY room_types_read ON room_types FOR SELECT USING (
  app_staff_scope(property_id)
  OR EXISTS (SELECT 1 FROM properties p WHERE p.id = property_id AND p.landlord_id = app_user_id())
  OR EXISTS (SELECT 1 FROM listings l WHERE l.property_id = room_types.property_id AND l.status = 'verified')
);
CREATE POLICY room_type_versions_read ON room_type_versions FOR SELECT USING (
  EXISTS (SELECT 1 FROM room_types scoped_rt WHERE scoped_rt.id=room_type_id AND app_staff_scope(scoped_rt.property_id))
  OR EXISTS (SELECT 1 FROM room_types rt JOIN properties p ON p.id = rt.property_id
             WHERE rt.id = room_type_id AND p.landlord_id = app_user_id())
  OR (status = 'approved' AND EXISTS (
    SELECT 1 FROM room_types rt JOIN listings l ON l.property_id = rt.property_id
    WHERE rt.id = room_type_id AND l.status = 'verified'))
);
CREATE POLICY room_type_photos_read ON room_type_photos FOR SELECT USING (
  EXISTS (SELECT 1 FROM room_type_versions rtv WHERE rtv.id = room_type_version_id)
);
CREATE POLICY room_change_sets_read ON room_inventory_change_sets FOR SELECT USING (
  app_staff_scope(property_id) OR EXISTS (SELECT 1 FROM properties p WHERE p.id = property_id AND p.landlord_id = app_user_id())
);
CREATE POLICY room_unit_changes_read ON room_unit_changes FOR SELECT USING (
  app_is_ops() OR EXISTS (
    SELECT 1 FROM room_inventory_change_sets cs JOIN properties p ON p.id = cs.property_id
    WHERE cs.id = change_set_id AND p.landlord_id = app_user_id())
);
CREATE POLICY unit_blocks_read ON unit_blocks FOR SELECT USING (
  app_is_ops() OR EXISTS (
    SELECT 1 FROM units u WHERE u.id = unit_id AND (
      EXISTS (SELECT 1 FROM properties p WHERE p.id = u.property_id AND p.landlord_id = app_user_id())
      OR EXISTS (SELECT 1 FROM listings l WHERE l.property_id = u.property_id AND l.status = 'verified')))
);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON room_types, room_type_versions, room_type_photos,
  room_inventory_change_sets, room_unit_changes, unit_blocks TO app_user;
GRANT UPDATE (room_type_id, archived_at) ON units TO app_user;
GRANT UPDATE (retired_at) ON beds TO app_user;
