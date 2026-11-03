ALTER TABLE office_cases ADD COLUMN reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL;
CREATE OR REPLACE FUNCTION app_management_access_for(actor uuid, target_property uuid, capability text) RETURNS boolean
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
   AND EXISTS (SELECT 1 FROM public.user_role_assignments ura JOIN public.roles r ON r.id=ura.role_id JOIN public.role_permissions rp ON rp.role_id=r.id JOIN public.permissions permission ON permission.id=rp.permission_id AND permission.key='management.use'
    WHERE ura.user_id=actor AND r.key='property_manager' AND ura.revoked_at IS NULL AND ura.valid_from<=now()
     AND (ura.valid_until IS NULL OR ura.valid_until>now()))
 );
$$;
