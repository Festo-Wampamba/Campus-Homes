-- Occupancy gap fix: units.operational_status already existed (0013) but
-- nothing could ever write it after unit creation, and search/detail never
-- read it — a room filled outside the reservation flow (a walk-in tenant, a
-- landlord's own direct deal) had no way to stop showing as available to
-- students. This gives both the landlord and Ops a real, narrow write path.
--
-- Landlords get column-restricted UPDATE only: the blanket table-level
-- UPDATE grant (0001's "GRANT ... UPDATE ON ALL TABLES") is revoked for
-- units and re-granted on operational_status alone, so this can't become a
-- backdoor around the deliberate "units are Ops-only to write" decision for
-- price/capacity/room_category (0001 comment, unit_photos.ts) — a landlord
-- can flip a room's status but never its verified details. Ops already had
-- units_ops_update (0001, full-row) and is unaffected in practice: nothing
-- in the codebase has ever updated any other units column.
REVOKE UPDATE ON units FROM app_user;
--> statement-breakpoint
GRANT UPDATE (operational_status) ON units TO app_user;
--> statement-breakpoint

CREATE POLICY units_landlord_operational_status_update ON units FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM listings l
      JOIN properties p ON p.id = l.property_id
      WHERE l.id = units.listing_id AND p.landlord_id = app_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM listings l
      JOIN properties p ON p.id = l.property_id
      WHERE l.id = units.listing_id AND p.landlord_id = app_user_id()
    )
  );
