-- Ops routes are now gated by the permission matrix (PermissionsGuard), not by
-- @Roles alone. Routes with no fitting catalog key get one here, granted to
-- exactly the roles that pass them today, so no one is locked out silently.
INSERT INTO permissions (key, description, requires_step_up) VALUES
  ('campus_photos.manage', 'Replace a campus landing-page photo', false),
  ('onboarding_leads.manage', 'View and update landlord onboarding requests', false),
  ('landlords.invite', 'Invite a landlord to register and onboard themselves', false),
  ('room_changes.review', 'Review landlord room inventory change requests', false)
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint

-- Two existing keys were never granted to the ops roles whose documented
-- workflow uses them: a lead runs its own self-assigned inspection end to end
-- (visits.inspect), and ops staff mark rooms taken/free by hand
-- (units.update_operational_status). platform_admin is deliberately not given
-- either; it holds no ops-execution keys in the seed matrix.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  ('super_admin','campus_photos.manage'), ('super_admin','onboarding_leads.manage'),
  ('super_admin','landlords.invite'), ('super_admin','room_changes.review'),
  ('platform_admin','campus_photos.manage'), ('platform_admin','onboarding_leads.manage'),
  ('platform_admin','landlords.invite'), ('platform_admin','room_changes.review'),
  ('ops_lead','campus_photos.manage'), ('ops_lead','onboarding_leads.manage'),
  ('ops_lead','landlords.invite'), ('ops_lead','room_changes.review'),
  ('ops_lead','visits.inspect'), ('ops_lead','units.update_operational_status'),
  ('ops_inspector','units.update_operational_status')
) AS grant_map(role_key, permission_key)
JOIN roles r ON r.key = grant_map.role_key
JOIN permissions p ON p.key = grant_map.permission_key
ON CONFLICT DO NOTHING;
