-- Hard-deleting a user runs runPurgeCascade, which must remove the user's
-- auth_invitations rows (they can't be anonymized: invited_by is NOT NULL and
-- the accepted/cancelled status CHECKs require their actor columns non-null).
-- The cascade runs as app_user (service GUC, not a separate SQL role), which
-- had only SELECT/INSERT/UPDATE on auth_invitations (0036) — so the DELETE
-- failed. RLS still gates it: the svc_all policy admits only service context.
GRANT DELETE ON auth_invitations TO app_user;
