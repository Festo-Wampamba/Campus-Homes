-- A landlord-recorded private tenant (users.tenancy_property_id, 0088) can
-- later open a student portal: the landlord issues a single-use code for that
-- one record, and a signed-in student redeems it. This table is the auditable
-- link between the private record and the account that claimed it; the
-- private row itself never becomes a login identity.
CREATE TABLE tenancy_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  -- sha256 of the code; the code itself is shown to the landlord once.
  code_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'revoked')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  claimed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  CHECK ((status = 'claimed') = (claimed_at IS NOT NULL))
);
-- One live invitation per private record; issuing another revokes the last.
CREATE UNIQUE INDEX tenancy_claims_one_pending ON tenancy_claims(tenant_user_id) WHERE status = 'pending';
ALTER TABLE tenancy_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy_claims FORCE ROW LEVEL SECURITY;
CREATE POLICY svc_all ON tenancy_claims FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
GRANT SELECT, INSERT, UPDATE ON tenancy_claims TO app_user;
