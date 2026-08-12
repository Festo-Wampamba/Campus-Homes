-- Existing accounts created before the Users admin flow synchronized account
-- type changes can have an Ops role without the matching directory record.
-- Backfill those records so active leads can assign them immediately.
INSERT INTO ops_staff (user_id, team, active)
SELECT
  u.id,
  CASE WHEN u.role = 'ops_lead' THEN 'lead'::ops_team ELSE 'inspector'::ops_team END,
  true
FROM users u
WHERE u.role IN ('ops_inspector', 'ops_lead')
  AND u.deleted_at IS NULL
ON CONFLICT (user_id) DO UPDATE
SET
  team = EXCLUDED.team,
  active = CASE
    WHEN ops_staff.team = EXCLUDED.team THEN ops_staff.active
    ELSE true
  END;
