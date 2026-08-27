-- Per-checklist-item correction workflow: an ops_lead reviewing a visit at
-- /ops/visits/[id] can send one specific checklist component (not the whole
-- visit) back to the assigned inspector to redo, with a message. The
-- inspector fixes it and explicitly resubmits. This is deliberately targeted
-- at the inspector, never the landlord — the checklist data (location GPS,
-- rooms, amenities, photos, landlord-identity check, safety) is captured by
-- the inspector during the physical visit, not supplied by the landlord.
--
-- No client-facing RLS write policy: "lead can raise, only the assigned
-- inspector can resolve" isn't expressible as a simple RLS predicate (it
-- depends on verification_visits.inspector_id), so both writes go through
-- service-role from ops.service.ts with an in-code check, same posture as
-- other cross-cutting ops writes in this codebase (e.g. createDraftListing).
CREATE TABLE visit_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES verification_visits(id) ON DELETE CASCADE,
  component text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  raised_by uuid NOT NULL REFERENCES ops_staff(user_id),
  raised_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
--> statement-breakpoint
ALTER TABLE visit_corrections ADD CONSTRAINT visit_corrections_status_check
  CHECK (status IN ('open', 'resolved'));
--> statement-breakpoint
CREATE INDEX visit_corrections_visit_idx ON visit_corrections (visit_id);
--> statement-breakpoint
ALTER TABLE visit_corrections ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY svc_all ON visit_corrections FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY visit_corrections_ops_read ON visit_corrections FOR SELECT USING (app_is_ops());
--> statement-breakpoint
-- Table-level grant is checked before RLS — without it every query 403s
-- regardless of policy, service_role writes included (withRlsContext never
-- SET ROLEs; service_role is just app_user with the GUC flipped, same as
-- every other svc_all table in this codebase, e.g. activities 0017).
GRANT SELECT, INSERT, UPDATE, DELETE ON visit_corrections TO app_user;
