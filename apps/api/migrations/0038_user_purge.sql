-- Permanent purge support. Soft-delete stays the default; a super admin can
-- additionally hard-delete a soft-deleted user and everything they own. To
-- keep audit and other historical records while removing the person, every
-- "actor" reference to a user (who did/reviewed/uploaded something, as opposed
-- to who OWNS the row) is anonymized to NULL on purge — so those columns must
-- be nullable. Ownership references already CASCADE from the user row.
ALTER TABLE audit_log ALTER COLUMN actor_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE user_role_assignments ALTER COLUMN assigned_by DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE user_permission_grants ALTER COLUMN granted_by DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE property_memberships ALTER COLUMN assigned_by DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE reservations ALTER COLUMN booked_by DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE landlords ALTER COLUMN kyc_reviewed_by DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE refunds ALTER COLUMN processed_by DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE approval_requests ALTER COLUMN requested_by DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE approval_requests ALTER COLUMN decided_by DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE auth_invitations ALTER COLUMN invited_by DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE auth_invitations ALTER COLUMN cancelled_by DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE auth_invitations ALTER COLUMN accepted_by DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE auth_invitations ALTER COLUMN target_user_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE campus_photos ALTER COLUMN uploaded_by DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE onboarding_leads ALTER COLUMN contacted_by DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE platform_integrations ALTER COLUMN created_by DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE platform_integrations ALTER COLUMN updated_by DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE platform_settings ALTER COLUMN updated_by DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE property_documents ALTER COLUMN uploaded_by DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE property_media ALTER COLUMN uploaded_by DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE report_exports ALTER COLUMN created_by DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE reservation_releases ALTER COLUMN released_by DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE tenant_agreement_templates ALTER COLUMN created_by DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE unit_photos ALTER COLUMN uploaded_by DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE chat_messages ALTER COLUMN from_user_id DROP NOT NULL;
--> statement-breakpoint
INSERT INTO permissions (key, description, requires_step_up) VALUES
  ('users.purge', 'Permanently purge a soft-deleted user and everything they own', true)
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description, requires_step_up = EXCLUDED.requires_step_up;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'super_admin' AND p.key = 'users.purge'
ON CONFLICT DO NOTHING;
