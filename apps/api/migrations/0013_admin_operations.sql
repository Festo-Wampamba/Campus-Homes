-- CampusHomes admin operations: user lifecycle, property-scoped access,
-- operational inventory, live settings, integration catalog, and exports.

ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'custodian';
--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'property_worker';
--> statement-breakpoint
ALTER TYPE "public"."property_type" ADD VALUE IF NOT EXISTS 'apartment';
--> statement-breakpoint
ALTER TYPE "public"."property_type" ADD VALUE IF NOT EXISTS 'hall';
--> statement-breakpoint
ALTER TYPE "public"."property_type" ADD VALUE IF NOT EXISTS 'boarding_house';
--> statement-breakpoint
ALTER TYPE "public"."property_type" ADD VALUE IF NOT EXISTS 'shared_house';
--> statement-breakpoint
ALTER TYPE "public"."property_type" ADD VALUE IF NOT EXISTS 'studio';
--> statement-breakpoint
ALTER TYPE "public"."property_type" ADD VALUE IF NOT EXISTS 'other';
--> statement-breakpoint
ALTER TYPE "public"."room_category" ADD VALUE IF NOT EXISTS 'studio';
--> statement-breakpoint
ALTER TYPE "public"."room_category" ADD VALUE IF NOT EXISTS 'self_contained';
--> statement-breakpoint
ALTER TYPE "public"."room_category" ADD VALUE IF NOT EXISTS 'bedsitter';
--> statement-breakpoint
ALTER TYPE "public"."room_category" ADD VALUE IF NOT EXISTS 'dormitory';
--> statement-breakpoint

ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth date;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender text;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS nationality text;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS address text;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_name text;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_phone text;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS notes text;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_reason text;
--> statement-breakpoint

ALTER TABLE properties ADD COLUMN IF NOT EXISTS description text;
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN IF NOT EXISTS operational_status text NOT NULL DEFAULT 'open';
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN IF NOT EXISTS amenities jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN IF NOT EXISTS utilities jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN IF NOT EXISTS house_rules jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN IF NOT EXISTS contact_phone text;
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN IF NOT EXISTS contact_email text;
--> statement-breakpoint
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_operational_status_check;
--> statement-breakpoint
ALTER TABLE properties ADD CONSTRAINT properties_operational_status_check
  CHECK (operational_status IN ('open', 'temporarily_closed', 'under_renovation', 'emergency_closure'));
--> statement-breakpoint

ALTER TABLE units ADD COLUMN IF NOT EXISTS operational_status text NOT NULL DEFAULT 'available';
--> statement-breakpoint
ALTER TABLE units ADD COLUMN IF NOT EXISTS building_name text;
--> statement-breakpoint
ALTER TABLE units ADD COLUMN IF NOT EXISTS floor_label text;
--> statement-breakpoint
ALTER TABLE units ADD COLUMN IF NOT EXISTS electricity_meter_type text;
--> statement-breakpoint
ALTER TABLE units ADD COLUMN IF NOT EXISTS amenities jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE units ADD COLUMN IF NOT EXISTS notes text;
--> statement-breakpoint
ALTER TABLE units DROP CONSTRAINT IF EXISTS units_operational_status_check;
--> statement-breakpoint
ALTER TABLE units ADD CONSTRAINT units_operational_status_check
  CHECK (operational_status IN ('available', 'held', 'occupied', 'vacant', 'under_maintenance', 'blocked'));
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS property_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  media_type text NOT NULL DEFAULT 'image',
  caption text,
  sort_order smallint NOT NULL DEFAULT 0,
  uploaded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT property_media_type_check CHECK (media_type IN ('image', 'document', 'floor_plan', 'video'))
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS property_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  role text NOT NULL,
  worker_type text,
  status text NOT NULL DEFAULT 'active',
  assigned_by uuid NOT NULL REFERENCES users(id),
  starts_at timestamp with time zone NOT NULL DEFAULT now(),
  ends_at timestamp with time zone,
  revoked_at timestamp with time zone,
  revoked_by uuid REFERENCES users(id),
  revocation_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT property_membership_role_check CHECK (role IN ('landlord', 'custodian', 'property_worker', 'resident_student')),
  CONSTRAINT property_membership_worker_type_check CHECK (worker_type IS NULL OR worker_type IN ('cleaner', 'security_officer', 'maintenance_worker', 'general_worker')),
  CONSTRAINT property_membership_status_check CHECK (status IN ('active', 'suspended', 'expired', 'revoked'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS property_memberships_active_uk
  ON property_memberships(user_id, property_id, role)
  WHERE revoked_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS property_memberships_property_idx
  ON property_memberships(property_id, status) WHERE revoked_at IS NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS user_permission_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  scope_type text NOT NULL DEFAULT 'platform_wide',
  scope_id text,
  valid_from timestamp with time zone NOT NULL DEFAULT now(),
  valid_until timestamp with time zone,
  granted_by uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  revoked_at timestamp with time zone,
  revoked_by uuid REFERENCES users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS user_permission_grants_active_uk
  ON user_permission_grants(user_id, permission_id, scope_type, coalesce(scope_id, ''))
  WHERE revoked_at IS NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text NOT NULL,
  updated_by uuid REFERENCES users(id),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS platform_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  purpose text NOT NULL,
  category text NOT NULL,
  audience text NOT NULL DEFAULT 'internal',
  base_url text,
  enabled boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT platform_integrations_category_check CHECK (category IN ('payments', 'communications', 'maps', 'learning', 'transport', 'health', 'safety', 'analytics', 'finance', 'storage', 'operations', 'other')),
  CONSTRAINT platform_integrations_audience_check CHECK (audience IN ('internal', 'students', 'landlords', 'all'))
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS report_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL,
  format text NOT NULL,
  destination text NOT NULL DEFAULT 'download',
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'completed',
  file_name text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  error text,
  CONSTRAINT report_exports_format_check CHECK (format IN ('csv', 'xlsx', 'pdf', 'docx', 'pptx', 'json')),
  CONSTRAINT report_exports_destination_check CHECK (destination IN ('download', 'power_bi', 'financial_model')),
  CONSTRAINT report_exports_status_check CHECK (status IN ('pending', 'completed', 'failed'))
);
--> statement-breakpoint

ALTER TABLE property_media ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE property_memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE user_permission_grants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform_integrations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE report_exports ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY svc_all ON property_media FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON property_memberships FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON user_permission_grants FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON platform_settings FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON platform_integrations FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON report_exports FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON property_media, property_memberships,
  user_permission_grants, platform_settings, platform_integrations, report_exports TO app_user;
--> statement-breakpoint

INSERT INTO platform_settings (key, value, description) VALUES
  ('reservation_hold_hours', '72'::jsonb, 'Hours a room is exclusively held while payment completes'),
  ('reservation_fee_ugx', '5000'::jsonb, 'CampusHomes reservation service fee in UGX'),
  ('verification_valid_months', '12'::jsonb, 'Months before a property needs reverification'),
  ('registrations_open', 'true'::jsonb, 'Allow new student and landlord registrations'),
  ('maintenance_mode', 'false'::jsonb, 'Temporarily restrict public application access'),
  ('report_retention_days', '365'::jsonb, 'Days generated report audit records are retained'),
  ('support_contact', '{"email":"support@campushomes.com","phone":""}'::jsonb, 'Public support contact details')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint

INSERT INTO platform_integrations (key, name, purpose, category, audience, base_url, enabled, is_system) VALUES
  ('google-maps', 'Google Maps', 'Directions and nearby services for students', 'maps', 'students', 'https://maps.google.com', true, true),
  ('power-bi', 'Microsoft Power BI', 'Publish governed operational datasets for analysis', 'analytics', 'internal', NULL, false, true),
  ('financial-model', 'Financial analysis workspace', 'Export finance-ready workbooks and models', 'finance', 'internal', NULL, true, true),
  ('student-health', 'Student health services', 'Link students to approved nearby health resources', 'health', 'students', NULL, false, true),
  ('safe-boda', 'SafeBoda', 'Student transport and property directions', 'transport', 'students', 'https://safeboda.com', false, true)
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint

INSERT INTO roles (key, name, description) VALUES
  ('landlord', 'Landlord', 'Manages owned properties, inventory, workers, and property-level reporting.'),
  ('custodian', 'Custodian', 'Operates only properties explicitly assigned by a landlord or administrator.'),
  ('property_worker', 'Property Worker', 'Accesses only assigned tasks and minimum property context.'),
  ('student', 'Student', 'Accesses public listings and their own profile, reservations, requests, and resident property context.')
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
--> statement-breakpoint

INSERT INTO permissions (key, description, requires_step_up) VALUES
  ('users.create', 'Create a user account and its role profile', false),
  ('users.update', 'Update user identity, status, and particulars', false),
  ('users.delete', 'Soft-delete a user while preserving history', true),
  ('users.permissions_manage', 'Grant or revoke direct user permissions', true),
  ('properties.create', 'Create a property for a landlord', false),
  ('property_units.manage', 'Create and update property unit inventory', false),
  ('property_media.manage', 'Add and remove property media', false),
  ('reports.generate', 'Generate operational reports with filters', false),
  ('reports.export', 'Export reports as CSV, Excel, PDF, Word, PowerPoint, or JSON', true),
  ('reports.publish_powerbi', 'Publish approved report data to Power BI', true),
  ('verifications.export', 'Export property visit and landlord KYC evidence summaries', true),
  ('integrations.add', 'Register a new third-party integration', true),
  ('integrations.update', 'Update or enable a third-party integration', true),
  ('integrations.delete', 'Remove a custom third-party integration', true),
  ('properties.read_owned', 'View owned properties only', false),
  ('properties.update_owned', 'Update controlled fields on owned properties', false),
  ('properties.archive_owned', 'Archive an owned property', false),
  ('properties.submit_verification', 'Submit an owned property for verification', false),
  ('properties.read_assigned', 'View explicitly assigned properties only', false),
  ('units.read_owned', 'View units at owned properties', false),
  ('units.create_owned', 'Create units at owned properties', false),
  ('units.update_owned', 'Update units at owned properties', false),
  ('units.allocate_owned', 'Allocate units at owned properties', false),
  ('units.read_assigned', 'View units at assigned properties', false),
  ('units.update_operational_status', 'Update operational unit status at assigned properties', false),
  ('custodians.invite', 'Invite a custodian', false),
  ('custodians.assign', 'Assign a custodian to owned properties', false),
  ('custodians.revoke', 'Revoke a custodian property assignment', true),
  ('custodians.read_activity', 'View custodian activity at owned properties', false),
  ('workers.invite', 'Invite a property worker', false),
  ('workers.assign', 'Assign a worker to a property', false),
  ('workers.deactivate', 'Deactivate a property worker assignment', true),
  ('workers.read_activity', 'View worker activity at owned properties', false),
  ('workers.read_assigned', 'View workers assigned to the same property', false),
  ('tasks.create', 'Create work orders at owned properties', false),
  ('tasks.assign', 'Assign property work orders', false),
  ('tasks.update', 'Update property work orders', false),
  ('tasks.cancel', 'Cancel property work orders', false),
  ('tasks.verify_completion', 'Verify task completion evidence', false),
  ('tasks.create_assigned', 'Create tasks at assigned properties', false),
  ('tasks.assign_assigned', 'Assign tasks at assigned properties', false),
  ('tasks.read_own', 'View personally assigned tasks', false),
  ('tasks.accept_own', 'Accept personally assigned tasks', false),
  ('tasks.update_own', 'Update personally assigned tasks', false),
  ('tasks.complete_own', 'Complete personally assigned tasks', false),
  ('calendar.manage_owned', 'Manage calendars for owned properties', false),
  ('calendar.manage_assigned', 'Manage calendars for assigned properties', false),
  ('calendar.read_own', 'View personal work calendar', false),
  ('incidents.read_owned', 'View incidents at owned properties', false),
  ('incidents.resolve_owned', 'Resolve incidents at owned properties', false),
  ('incidents.create', 'Create an incident at an assigned property', false),
  ('incidents.update_assigned', 'Update incidents at assigned properties', false),
  ('incidents.create_assigned', 'Report incidents at assigned properties', false),
  ('finance.read_owned', 'View reservation fee activity for owned properties', false),
  ('reports.export_owned', 'Export reports for owned properties', false),
  ('service_requests.read_assigned', 'View requests for assigned properties', false),
  ('service_requests.assign', 'Assign property service requests', false),
  ('service_requests.update', 'Update property service requests', false),
  ('service_requests.escalate', 'Escalate property service requests', false),
  ('notices.publish_assigned', 'Publish notices to assigned properties', false),
  ('reports.submit_to_landlord', 'Submit property reports to the landlord', false),
  ('evidence.upload_own', 'Upload evidence for personally assigned work', false),
  ('issues.report_assigned', 'Report a problem at an assigned property', false),
  ('listings.read_verified', 'View public verified listings', false),
  ('units.read_available', 'View publicly available units', false),
  ('reservations.create_own', 'Create own reservation', false),
  ('reservations.read_own', 'View own reservations', false),
  ('reservations.cancel_own', 'Cancel own eligible reservations', false),
  ('payments.create_own', 'Pay for own reservations', false),
  ('payments.read_own', 'View own payment history', false),
  ('chat.use_own_reservation', 'Use chat for own reservation', false),
  ('move_in.confirm_own', 'Confirm own move-in', false),
  ('reviews.create_own_fulfilled', 'Review a fulfilled own reservation', false),
  ('service_requests.create_own', 'Create a request for own current property', false),
  ('service_requests.read_own', 'View own service requests', false),
  ('service_requests.escalate_own', 'Escalate own unresolved request', false),
  ('incidents.report_own_property', 'Report an incident at own current property', false)
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description, requires_step_up = EXCLUDED.requires_step_up;
--> statement-breakpoint

-- Super Admin always receives the complete catalog, including permissions
-- introduced after the original RBAC migration.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.key = 'super_admin'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  ('landlord','properties.read_owned'), ('landlord','properties.create'), ('landlord','properties.update_owned'),
  ('landlord','properties.archive_owned'), ('landlord','properties.submit_verification'),
  ('landlord','units.read_owned'), ('landlord','units.create_owned'), ('landlord','units.update_owned'),
  ('landlord','units.allocate_owned'), ('landlord','custodians.invite'), ('landlord','custodians.assign'),
  ('landlord','custodians.revoke'), ('landlord','custodians.read_activity'), ('landlord','workers.invite'),
  ('landlord','workers.assign'), ('landlord','workers.deactivate'), ('landlord','workers.read_activity'),
  ('landlord','tasks.create'), ('landlord','tasks.assign'), ('landlord','tasks.update'),
  ('landlord','tasks.cancel'), ('landlord','tasks.verify_completion'), ('landlord','calendar.manage_owned'),
  ('landlord','incidents.read_owned'), ('landlord','incidents.resolve_owned'), ('landlord','finance.read_owned'),
  ('landlord','reports.export_owned'),
  ('custodian','properties.read_assigned'), ('custodian','units.read_assigned'),
  ('custodian','units.update_operational_status'), ('custodian','workers.read_assigned'),
  ('custodian','tasks.create_assigned'), ('custodian','tasks.assign_assigned'),
  ('custodian','tasks.verify_completion'), ('custodian','service_requests.read_assigned'),
  ('custodian','service_requests.assign'), ('custodian','service_requests.update'),
  ('custodian','service_requests.escalate'), ('custodian','incidents.create'),
  ('custodian','incidents.update_assigned'), ('custodian','calendar.manage_assigned'),
  ('custodian','notices.publish_assigned'), ('custodian','reports.submit_to_landlord'),
  ('property_worker','tasks.read_own'), ('property_worker','tasks.accept_own'),
  ('property_worker','tasks.update_own'), ('property_worker','tasks.complete_own'),
  ('property_worker','incidents.create_assigned'), ('property_worker','evidence.upload_own'),
  ('property_worker','calendar.read_own'), ('property_worker','issues.report_assigned'),
  ('student','listings.read_verified'), ('student','units.read_available'),
  ('student','reservations.create_own'), ('student','reservations.read_own'),
  ('student','reservations.cancel_own'), ('student','payments.create_own'),
  ('student','payments.read_own'), ('student','chat.use_own_reservation'),
  ('student','move_in.confirm_own'), ('student','reviews.create_own_fulfilled'),
  ('student','service_requests.create_own'), ('student','service_requests.read_own'),
  ('student','service_requests.escalate_own'), ('student','incidents.report_own_property')
) AS grant_map(role_key, permission_key)
JOIN roles r ON r.key = grant_map.role_key
JOIN permissions p ON p.key = grant_map.permission_key
ON CONFLICT DO NOTHING;
