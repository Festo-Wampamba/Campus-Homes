-- What the landlord lets each custodian or property worker do at their
-- property (Festo, 2026-11-05). Keys mirror TEAM_CAPABILITIES in
-- packages/shared/src/property-team.ts (update both together).
-- Custodians keep everything they could already do; workers start with none.
ALTER TABLE property_memberships
  ADD COLUMN capabilities text[] NOT NULL DEFAULT '{}'::text[];
--> statement-breakpoint
ALTER TABLE property_memberships
  ADD CONSTRAINT property_memberships_capabilities_known
  CHECK (capabilities <@ ARRAY['bookings.manage','payments.record','students.view','agreements.manage']::text[]);
--> statement-breakpoint
UPDATE property_memberships
   SET capabilities = ARRAY['bookings.manage','payments.record','students.view','agreements.manage']::text[]
 WHERE role = 'custodian';
--> statement-breakpoint
-- Same rule as 0057: RLS must not be looser than the service check, which now
-- needs 'agreements.manage' and admits property workers granted it.
DROP POLICY IF EXISTS tenant_agreements_custodian_read ON tenant_agreements;
--> statement-breakpoint
CREATE POLICY tenant_agreements_custodian_read ON tenant_agreements FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM property_memberships pm
    WHERE pm.property_id = tenant_agreements.property_id
      AND pm.user_id = app_user_id()
      AND pm.role IN ('custodian', 'property_worker')
      AND 'agreements.manage' = ANY(pm.capabilities)
      AND pm.status = 'active'
      AND pm.revoked_at IS NULL
      AND pm.starts_at <= now()
      AND (pm.ends_at IS NULL OR pm.ends_at > now())
  ));
