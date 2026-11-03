INSERT INTO roles (key, name, description) VALUES
 ('director','Director','Company governance, executive reporting and independent major-decision approval.'),
 ('general_manager','General Manager','Daily business oversight, department coordination and escalation. No technical super-user access.'),
 ('office_admin','Office Administrator / Front Desk','Assigned inquiry intake, onboarding assistance, appointments and follow-ups.'),
 ('property_manager','Property Manager','Individual or agency management limited by an active landlord mandate and individual assignment.');
INSERT INTO permissions (key, description, requires_step_up) VALUES
 ('executive.read','View aggregate company performance without customer identity documents',false),
 ('governance.request','Submit a business decision for independent director approval',false),
 ('governance.decide','Approve or reject another person''s business decision; does not execute payments or access changes',true),
 ('office.read','View office cases within assignment and catchment limits',false),
 ('office.manage','Create and update office cases within assignment and catchment limits',false),
 ('management.use','Use the property management portal; individual mandates control property access',false);
INSERT INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('director','executive.read'),('director','finance.read'),('director','governance.request'),('director','governance.decide'),
 ('general_manager','executive.read'),('general_manager','governance.request'),
 ('general_manager','office.read'),('general_manager','office.manage'),
 ('general_manager','properties.read'),('general_manager','reservations.read'),
 ('general_manager','activities.read'),('general_manager','activities.manage'),
 ('general_manager','inquiries.read'),('general_manager','inquiries.resolve'),
 ('general_manager','disputes.read'),('general_manager','disputes.assign'),
 ('general_manager','refunds.read'),('general_manager','refunds.request'),
 ('general_manager','finance.read'),('general_manager','payments.read'),
 ('office_admin','office.read'),('office_admin','office.manage'),
 ('property_manager','management.use'),
 ('platform_admin','office.read'),('platform_admin','office.manage')
) AS g(role_key,permission_key) JOIN roles r ON r.key=g.role_key JOIN permissions p ON p.key=g.permission_key
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.key='super_admin' ON CONFLICT DO NOTHING;

CREATE TABLE management_agencies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE management_agency_members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agency_id uuid NOT NULL REFERENCES management_agencies(id),
 user_id uuid NOT NULL REFERENCES users(id), member_role text NOT NULL CHECK (member_role IN ('owner','member')),
 revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX management_agency_member_active ON management_agency_members(agency_id,user_id) WHERE revoked_at IS NULL;
CREATE TABLE property_management_mandates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), property_id uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
 landlord_id uuid NOT NULL REFERENCES users(id), manager_id uuid REFERENCES users(id), agency_id uuid REFERENCES management_agencies(id),
 capabilities text[] NOT NULL CHECK (capabilities <@ ARRAY['property.read','property.edit','reservations.read','maintenance.manage','notices.manage','finance.read','reports.submit','team.manage']::text[] AND 'property.read'=ANY(capabilities)),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','rejected','revoked')),
 reason text NOT NULL, accepted_by uuid REFERENCES users(id), accepted_at timestamptz, revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK ((manager_id IS NULL) <> (agency_id IS NULL))
);
CREATE INDEX management_mandates_property ON property_management_mandates(property_id,status);
CREATE TABLE management_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mandate_id uuid NOT NULL REFERENCES property_management_mandates(id),
 user_id uuid NOT NULL REFERENCES users(id), capabilities text[] NOT NULL,
 assigned_by uuid NOT NULL REFERENCES users(id), revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX management_assignment_active ON management_assignments(mandate_id,user_id) WHERE revoked_at IS NULL;
CREATE TABLE management_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), property_id uuid NOT NULL REFERENCES properties(id),
 kind text NOT NULL CHECK(kind IN ('maintenance','incident','notice','report')), title text NOT NULL, body text NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved')),
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE office_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK(kind IN ('inquiry','onboarding','appointment','refund_request')),
 subject text NOT NULL, customer_name text NOT NULL, contact text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '',
 catchment text NOT NULL CHECK(catchment IN ('MUK','MUBS','KIU','KYU')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','escalated','closed')),
 assigned_to uuid NOT NULL REFERENCES users(id), created_by uuid NOT NULL REFERENCES users(id), scheduled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX office_cases_assignment ON office_cases(assigned_to,status,catchment);
-- Every new storage surface is service-only, including read access. Explicit
-- API projections and mandate checks are required before crossing this boundary.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['management_agencies','management_agency_members','property_management_mandates','management_assignments','management_notes','office_cases'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY svc_all ON %I FOR ALL USING (app_is_service()) WITH CHECK (app_is_service())',t);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO app_user',t);
 END LOOP;
END $$;

CREATE FUNCTION app_management_access_for(actor uuid, target_property uuid, capability text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET app.user_role='service_role' AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.management_assignments a
  JOIN public.property_management_mandates m ON m.id=a.mandate_id
  JOIN public.properties p ON p.id=m.property_id AND p.landlord_id=m.landlord_id
  JOIN public.landlords l ON l.user_id=m.landlord_id AND l.kyc_status='verified'
  JOIN public.users owner_user ON owner_user.id=m.landlord_id AND owner_user.status='active' AND owner_user.deleted_at IS NULL
  JOIN public.users u ON u.id=a.user_id AND u.status='active' AND u.deleted_at IS NULL
  WHERE a.user_id=actor AND p.id=target_property AND a.revoked_at IS NULL
   AND m.status='active' AND m.revoked_at IS NULL AND m.starts_at<=now() AND m.ends_at>now()
   AND capability=ANY(a.capabilities) AND a.capabilities <@ m.capabilities
   AND ((m.manager_id=actor) OR (m.agency_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.management_agency_members am WHERE am.agency_id=m.agency_id AND am.user_id=actor AND am.revoked_at IS NULL)))
   AND EXISTS (SELECT 1 FROM public.user_role_assignments ura JOIN public.roles r ON r.id=ura.role_id
    WHERE ura.user_id=actor AND r.key='property_manager' AND ura.revoked_at IS NULL AND ura.valid_from<=now()
     AND (ura.valid_until IS NULL OR ura.valid_until>now()))
 );
$$;
REVOKE ALL ON FUNCTION app_management_access_for(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_management_access_for(uuid,uuid,text) TO app_user;
