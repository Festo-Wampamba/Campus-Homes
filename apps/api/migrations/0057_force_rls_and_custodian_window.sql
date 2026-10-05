-- Re-run the 0030 FORCE sweep. beds, product_events and reservation_releases
-- were created (0032/0034) after that one-time sweep, so a freshly migrated DB
-- left their table owner free to bypass every policy. Idempotent: only touches
-- tables still unforced, and stays dynamic so it can never drift from the
-- RLS-enabled set. rls.spec.ts asserts the invariant so a future table that
-- forgets FORCE fails CI.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT relname FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relkind = 'r'
      AND relrowsecurity = true
      AND NOT relforcerowsecurity
  LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- 0020's custodian read only checked that a membership row existed. The service
-- layer also honours status and the starts_at/ends_at window, so RLS must not
-- be looser than the code: a suspended, expired or not-yet-started custodian
-- would otherwise read tenant agreements through any non-service path.
DROP POLICY IF EXISTS tenant_agreements_custodian_read ON tenant_agreements;
--> statement-breakpoint
CREATE POLICY tenant_agreements_custodian_read ON tenant_agreements FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM property_memberships pm
    WHERE pm.property_id = tenant_agreements.property_id
      AND pm.user_id = app_user_id()
      AND pm.role = 'custodian'
      AND pm.status = 'active'
      AND pm.revoked_at IS NULL
      AND pm.starts_at <= now()
      AND (pm.ends_at IS NULL OR pm.ends_at > now())
  ));
