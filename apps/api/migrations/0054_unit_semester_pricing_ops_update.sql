-- Ops re-publish lets a lead change a room's price/deposit for the current
-- semester, which upserts unit_semester_pricing (INSERT ... ON CONFLICT DO
-- UPDATE). The UPDATE arm needs an ops UPDATE grant + RLS policy; 0037 only
-- created the INSERT policy + grant. svc_all already covers service paths.
GRANT UPDATE ON unit_semester_pricing TO app_user;
--> statement-breakpoint
CREATE POLICY unit_semester_pricing_ops_update ON unit_semester_pricing
  FOR UPDATE USING (app_is_ops()) WITH CHECK (app_is_ops());
