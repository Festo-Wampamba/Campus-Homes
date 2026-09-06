-- Provider assurance is independent from the local session's creation time.
-- Existing sessions deliberately receive no MFA or authentication-time evidence.
ALTER TABLE sessions ADD COLUMN authenticated_at timestamptz;
--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN mfa_verified boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE sessions ADD CONSTRAINT sessions_mfa_assurance_check
  CHECK (NOT mfa_verified OR authenticated_at IS NOT NULL);
--> statement-breakpoint

-- Explicit bootstrap context also works for migration owners under FORCE RLS.
SELECT set_config('app.user_role', 'service_role', true);
--> statement-breakpoint

-- Preserve consumer data only where no grant history for that workspace exists.
-- A revoked, future or expired assignment is authoritative, never overwritten.
INSERT INTO user_role_assignments (user_id, role_id, scope_type, scope_id, assigned_by, reason)
SELECT u.id, r.id, 'platform_wide', NULL, u.id, '0035: preserve existing consumer workspace'
FROM users u CROSS JOIN roles r
WHERE u.status = 'active' AND u.deleted_at IS NULL AND r.key IN ('student', 'landlord')
  AND (u.role::text = r.key
    OR (r.key = 'student' AND EXISTS (SELECT 1 FROM students s WHERE s.user_id = u.id))
    OR (r.key = 'landlord' AND EXISTS (SELECT 1 FROM landlords l WHERE l.user_id = u.id)))
  AND NOT EXISTS (SELECT 1 FROM user_role_assignments a WHERE a.user_id = u.id AND a.role_id = r.id);
--> statement-breakpoint

-- users.role cannot identify an admin's RBAC role or scope; ops_staff also is
-- not independent evidence (0019 synthesized those rows from users.role).
-- Keep existing active staff grants exactly as assigned. Flag every legacy
-- staff identity without a valid grant for explicit review; NEVER infer a
-- platform-wide grant, reactivate a revoked grant, or promote admin to super_admin.
INSERT INTO approval_requests (request_type, requested_by, target_type, target_id, payload, reason)
SELECT 'auth_access_backfill_review', u.id, 'user', u.id,
  jsonb_build_object('legacyRole', u.role, 'migration', '0035',
    'action', 'Review grant history and explicitly assign an approved role and scope'),
  'Legacy staff identity has no validated active assignment; staff access is denied pending review'
FROM users u
WHERE u.deleted_at IS NULL AND u.role::text IN ('admin', 'ops_lead', 'ops_inspector', 'custodian', 'property_worker')
  AND NOT EXISTS (
    SELECT 1 FROM user_role_assignments a JOIN roles r ON r.id = a.role_id
    WHERE a.user_id = u.id AND a.revoked_at IS NULL AND a.valid_from <= now()
      AND (a.valid_until IS NULL OR a.valid_until > now())
      AND r.key IN ('super_admin','platform_admin','finance_admin','support_admin','auditor',
        'ops_lead','ops_inspector','custodian','property_worker')
      AND ((a.scope_type = 'platform_wide' AND a.scope_id IS NULL)
        OR (a.scope_type = 'catchment' AND a.scope_id IN ('MUK','MUBS','KIU','KYU','all'))
        OR (a.scope_type = 'property' AND EXISTS (SELECT 1 FROM properties p WHERE p.id::text = a.scope_id)))
  )
  AND NOT EXISTS (SELECT 1 FROM approval_requests q
    WHERE q.request_type = 'auth_access_backfill_review' AND q.target_id = u.id);
--> statement-breakpoint

-- This read-only helper evaluates current assignments under service context so
-- it works with FORCE RLS and cannot recurse through properties' own policies.
-- Function-local GUC/search_path are restored by PostgreSQL on return or error.
-- The public wrapper supplies authenticated request identity before entering
-- the function-local service context. No row or credential is returned.
CREATE FUNCTION app_staff_scope_for(actor uuid, effective_role text, verified_mfa boolean,
  target_property uuid, lead_only boolean) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
SET app.user_role = 'service_role'
AS $$
  SELECT coalesce(verified_mfa, false)
    AND effective_role IN ('admin', 'ops_lead', 'ops_inspector')
    AND (NOT lead_only OR effective_role IN ('admin', 'ops_lead'))
    AND EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.user_role_assignments a ON a.user_id = u.id
      JOIN public.roles r ON r.id = a.role_id
      WHERE u.id = actor AND u.status = 'active' AND u.deleted_at IS NULL
        AND a.revoked_at IS NULL AND a.valid_from <= now()
        AND (a.valid_until IS NULL OR a.valid_until > now())
        AND CASE WHEN r.key IN ('super_admin','platform_admin','finance_admin','support_admin','auditor')
          THEN 'admin' ELSE r.key END = effective_role
        AND (
          (a.scope_type = 'platform_wide' AND a.scope_id IS NULL)
          OR (target_property IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.properties p WHERE p.id = target_property AND (
              (a.scope_type = 'property' AND a.scope_id = p.id::text)
              OR (a.scope_type = 'catchment' AND (a.scope_id = p.catchment::text OR a.scope_id = 'all'))
            )
          ))
        )
    )
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_staff_scope_for(uuid,text,boolean,uuid,boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_staff_scope_for(uuid,text,boolean,uuid,boolean) TO app_user;
--> statement-breakpoint
CREATE FUNCTION app_staff_scope(target_property uuid DEFAULT NULL, lead_only boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  SELECT public.app_staff_scope_for(public.app_user_id(), public.app_role(),
    coalesce(current_setting('app.mfa_verified', true) = 'true', false), target_property, lead_only)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_staff_scope(uuid,boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_staff_scope(uuid,boolean) TO app_user;
--> statement-breakpoint

-- Existing broad policies now mean an active PLATFORM assignment, never merely
-- a staff enum or a catchment/property assignment. Scoped policies below add
-- only their property's rows. Personal ownership and public listing reads stay.
CREATE OR REPLACE FUNCTION app_is_ops() RETURNS boolean LANGUAGE sql STABLE
  AS $$ SELECT public.app_staff_scope(NULL, false) $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_is_lead() RETURNS boolean LANGUAGE sql STABLE
  AS $$ SELECT public.app_staff_scope(NULL, true) $$;
--> statement-breakpoint
CREATE POLICY properties_scoped_staff_read ON properties FOR SELECT USING (app_staff_scope(id));
--> statement-breakpoint
CREATE POLICY properties_scoped_staff_update ON properties FOR UPDATE
  USING (app_staff_scope(id)) WITH CHECK (app_staff_scope(id));
--> statement-breakpoint
CREATE POLICY documents_scoped_staff_read ON property_documents FOR SELECT USING (app_staff_scope(property_id));
--> statement-breakpoint
CREATE POLICY documents_scoped_staff_update ON property_documents FOR UPDATE
  USING (app_staff_scope(property_id)) WITH CHECK (app_staff_scope(property_id));
--> statement-breakpoint

-- Assignment to a historic visit alone must not restore revoked staff access.
ALTER POLICY visits_read ON verification_visits USING (
  app_staff_scope(property_id) AND (inspector_id = app_user_id() OR app_role() IN ('admin','ops_lead')));
--> statement-breakpoint
ALTER POLICY visits_inspector_update ON verification_visits
  USING (inspector_id = app_user_id() AND app_role() = 'ops_inspector' AND app_staff_scope(property_id))
  WITH CHECK (inspector_id = app_user_id() AND app_role() = 'ops_inspector' AND app_staff_scope(property_id));
--> statement-breakpoint
CREATE POLICY visits_scoped_lead_insert ON verification_visits FOR INSERT
  WITH CHECK (app_staff_scope(property_id, true));
--> statement-breakpoint
CREATE POLICY visits_scoped_lead_update ON verification_visits FOR UPDATE
  USING (app_staff_scope(property_id, true)) WITH CHECK (app_staff_scope(property_id, true));
--> statement-breakpoint
CREATE POLICY corrections_scoped_staff_read ON visit_corrections FOR SELECT USING (
  EXISTS (SELECT 1 FROM verification_visits v WHERE v.id = visit_id AND app_staff_scope(v.property_id)));
--> statement-breakpoint
CREATE POLICY listings_scoped_staff_read ON listings FOR SELECT USING (app_staff_scope(property_id));
--> statement-breakpoint
CREATE POLICY listings_scoped_lead_update ON listings FOR UPDATE
  USING (app_staff_scope(property_id, true)) WITH CHECK (app_staff_scope(property_id, true));
--> statement-breakpoint
CREATE POLICY versions_scoped_staff_read ON listing_versions FOR SELECT USING (
  EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id AND app_staff_scope(l.property_id)));
--> statement-breakpoint
CREATE POLICY versions_scoped_lead_insert ON listing_versions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id AND app_staff_scope(l.property_id, true)));
--> statement-breakpoint
CREATE POLICY versions_scoped_lead_update ON listing_versions FOR UPDATE USING (
  EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id AND app_staff_scope(l.property_id, true)))
  WITH CHECK (EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id AND app_staff_scope(l.property_id, true)));
--> statement-breakpoint
CREATE POLICY photos_scoped_staff_read ON listing_photos FOR SELECT USING (
  EXISTS (SELECT 1 FROM listing_versions v JOIN listings l ON l.id = v.listing_id
    WHERE v.id = listing_version_id AND app_staff_scope(l.property_id)));
--> statement-breakpoint
CREATE POLICY photos_scoped_staff_insert ON listing_photos FOR INSERT WITH CHECK (
  captured_by = app_user_id() AND EXISTS (SELECT 1 FROM listing_versions v JOIN listings l ON l.id = v.listing_id
    WHERE v.id = listing_version_id AND app_staff_scope(l.property_id)));
--> statement-breakpoint
CREATE POLICY units_scoped_staff_read ON units FOR SELECT USING (
  EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id AND app_staff_scope(l.property_id)));
--> statement-breakpoint
CREATE POLICY units_scoped_staff_insert ON units FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id AND app_staff_scope(l.property_id)));
--> statement-breakpoint
CREATE POLICY units_scoped_staff_update ON units FOR UPDATE USING (
  EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id AND app_staff_scope(l.property_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id AND app_staff_scope(l.property_id)));
--> statement-breakpoint
CREATE POLICY beds_scoped_staff_read ON beds FOR SELECT USING (
  EXISTS (SELECT 1 FROM units u JOIN listings l ON l.id = u.listing_id WHERE u.id = unit_id AND app_staff_scope(l.property_id)));
--> statement-breakpoint
CREATE POLICY beds_scoped_staff_insert ON beds FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM units u JOIN listings l ON l.id = u.listing_id WHERE u.id = unit_id AND app_staff_scope(l.property_id)));
--> statement-breakpoint
CREATE POLICY beds_scoped_staff_update ON beds FOR UPDATE USING (
  EXISTS (SELECT 1 FROM units u JOIN listings l ON l.id = u.listing_id WHERE u.id = unit_id AND app_staff_scope(l.property_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM units u JOIN listings l ON l.id = u.listing_id WHERE u.id = unit_id AND app_staff_scope(l.property_id)));
--> statement-breakpoint
CREATE POLICY reservations_scoped_lead_read ON reservations FOR SELECT USING (
  EXISTS (SELECT 1 FROM beds b JOIN units u ON u.id = b.unit_id JOIN listings l ON l.id = u.listing_id
    WHERE b.id = bed_id AND app_staff_scope(l.property_id, true)));
--> statement-breakpoint
CREATE POLICY agreements_scoped_staff_read ON tenant_agreements FOR SELECT USING (app_staff_scope(property_id));
--> statement-breakpoint
CREATE POLICY media_scoped_staff_read ON property_media FOR SELECT USING (app_staff_scope(property_id));
--> statement-breakpoint

-- Functions run as the caller except the single read-only lookup above. Future
-- migration statements must choose their own bootstrap context explicitly.
SELECT set_config('app.user_role', '', true);
