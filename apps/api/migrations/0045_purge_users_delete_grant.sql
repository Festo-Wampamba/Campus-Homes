-- The permanent-purge transaction finishes by deleting the target row from
-- users. It runs through the low-privilege app_user database role with the
-- service_role RLS context, but users was omitted from the targeted DELETE
-- grants in 0042. The result was a 42501 error after every child record had
-- already been prepared for removal (the transaction then rolled back).
--
-- This is deliberately a privilege grant only: the existing users svc_all RLS
-- policy still requires app.user_role = 'service_role', so normal callers
-- cannot delete arbitrary accounts merely because app_user has DELETE.
GRANT DELETE ON users TO app_user;
