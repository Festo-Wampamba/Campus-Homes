-- Whole-property gallery photos: property_media (0013) already has the
-- right shape for a landlord write surface (no ops_staff FK, unlike
-- listing_photos, which stays deliberately ops-only/EXIF-verified) — it
-- just had no landlord RLS policy and was never wired to the public listing
-- page. This adds the landlord side; ops/admin already reach this table via
-- service_role in admin-properties.service.ts, so no ops policy is needed
-- here. Public reads run through the same SERVICE_CTX pattern properties/
-- listing_photos already use for public detail() reads (0001 precedent),
-- so no public SELECT policy is added either — svc_all (0013) already
-- covers that path.
CREATE POLICY property_media_landlord_read ON property_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_id AND p.landlord_id = app_user_id()
    )
  );
--> statement-breakpoint
CREATE POLICY property_media_landlord_insert ON property_media FOR INSERT
  WITH CHECK (
    uploaded_by = app_user_id()
    AND EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_id AND p.landlord_id = app_user_id()
    )
  );
--> statement-breakpoint
CREATE POLICY property_media_landlord_delete ON property_media FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_id AND p.landlord_id = app_user_id()
    )
  );
