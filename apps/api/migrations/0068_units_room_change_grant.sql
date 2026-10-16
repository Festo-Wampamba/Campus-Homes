-- Approving a room change failed with "permission denied for table units".
-- 0024 limited app_user's UPDATE on units to operational_status, and 0040 only
-- added room_type_id and archived_at, but the approve path
-- (RoomManagementService.applyUnitChange / applyRoomTypeVersion) also writes
-- label, capacity, room_category, building_name and floor_label.
--
-- Column grants belong to app_user, which every caller shares, so granting
-- these columns alone would let a landlord edit them through
-- units_landlord_operational_status_update (0037), which is row-scoped only.
-- The trigger keeps 0024's rule in the database: outside service_role (the
-- approve path), only operational_status may change. It also closes the
-- landlord/ops write that 0040's room_type_id/archived_at grant opened.
GRANT UPDATE (label, capacity, room_category, building_name, floor_label) ON units TO app_user;
--> statement-breakpoint
CREATE FUNCTION units_guard_room_details() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  -- Superuser/bypassrls (migrations, seeds) are outside RLS, so outside this rule too.
  IF app_is_service() OR (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user) THEN
    RETURN NEW;
  END IF;
  IF to_jsonb(NEW) - 'operational_status' IS DISTINCT FROM to_jsonb(OLD) - 'operational_status' THEN
    RAISE EXCEPTION 'permission denied: only operational_status can be changed on units outside an approved room change'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER units_guard_room_details BEFORE UPDATE ON units
  FOR EACH ROW EXECUTE FUNCTION units_guard_room_details();
