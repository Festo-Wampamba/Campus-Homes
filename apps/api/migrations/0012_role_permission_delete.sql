-- Role permission replacement is an audited super-admin operation. RLS still
-- restricts the table to service_role; this grant only makes the DELETE arm
-- available to the same app_user connection used for INSERT/UPDATE in 0011.
GRANT DELETE ON role_permissions TO app_user;
