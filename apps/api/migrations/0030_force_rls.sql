-- Table owners bypass RLS by default unless FORCE ROW LEVEL SECURITY is set.
-- Verified during the Neon->self-host migration review that this was never
-- set: every RLS-enabled table had relforcerowsecurity = false. The API
-- always connects as app_user (never the table owner), so this had no
-- practical effect so far, but nothing enforced it — a migration or admin
-- script run as the owner role would have silently skipped every policy,
-- with no error, just quietly-wrong query results.
-- Dynamic over pg_class (not a hardcoded table list) so it never drifts as
-- new RLS-enabled tables get added.
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
