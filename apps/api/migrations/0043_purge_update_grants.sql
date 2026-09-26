-- Follow-up to 0042: the hard-delete cascade also anonymizes actor references
-- via UPDATE, and app_user lacked UPDATE on a few of those tables.
-- Grant UPDATE where it's safe (each keeps its service_role-only svc_all RLS
-- policy, so normal users still can't update these rows).
GRANT UPDATE ON inquiries, reservation_releases, unit_photos TO app_user;
--> statement-breakpoint
-- audit_log is append-only even for service_role (UPDATE is intentionally
-- revoked for everyone but the owner), so the cascade cannot null actor_id via
-- UPDATE. Make the FK ON DELETE SET NULL instead: deleting the user nulls
-- actor_id automatically (a referential action, not a privilege-checked UPDATE),
-- keeping the audit row and its append-only guarantee intact.
ALTER TABLE audit_log DROP CONSTRAINT audit_log_actor_id_users_id_fk;
--> statement-breakpoint
ALTER TABLE audit_log ADD CONSTRAINT audit_log_actor_id_users_id_fk
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;
--> statement-breakpoint
-- Room-management attribution is historical metadata, not ownership. A staff
-- member can create or review inventory for a landlord they do not own, so
-- these references must not block that staff member's permanent purge. Keep
-- the inventory and anonymize just the actor through referential actions.
ALTER TABLE room_types ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE room_inventory_change_sets ALTER COLUMN submitted_by DROP NOT NULL;
ALTER TABLE room_type_versions ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE room_type_photos ALTER COLUMN uploaded_by DROP NOT NULL;
ALTER TABLE room_unit_changes ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE unit_blocks ALTER COLUMN created_by DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE room_types DROP CONSTRAINT room_types_created_by_fkey;
ALTER TABLE room_types ADD CONSTRAINT room_types_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE room_inventory_change_sets DROP CONSTRAINT room_inventory_change_sets_submitted_by_fkey;
ALTER TABLE room_inventory_change_sets ADD CONSTRAINT room_inventory_change_sets_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE room_inventory_change_sets DROP CONSTRAINT room_inventory_change_sets_reviewed_by_fkey;
ALTER TABLE room_inventory_change_sets ADD CONSTRAINT room_inventory_change_sets_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE room_type_versions DROP CONSTRAINT room_type_versions_created_by_fkey;
ALTER TABLE room_type_versions ADD CONSTRAINT room_type_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE room_type_versions DROP CONSTRAINT room_type_versions_reviewed_by_fkey;
ALTER TABLE room_type_versions ADD CONSTRAINT room_type_versions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE room_type_photos DROP CONSTRAINT room_type_photos_uploaded_by_fkey;
ALTER TABLE room_type_photos ADD CONSTRAINT room_type_photos_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE room_unit_changes DROP CONSTRAINT room_unit_changes_created_by_fkey;
ALTER TABLE room_unit_changes ADD CONSTRAINT room_unit_changes_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE unit_blocks DROP CONSTRAINT unit_blocks_created_by_fkey;
ALTER TABLE unit_blocks ADD CONSTRAINT unit_blocks_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE unit_blocks DROP CONSTRAINT unit_blocks_cleared_by_fkey;
ALTER TABLE unit_blocks ADD CONSTRAINT unit_blocks_cleared_by_fkey FOREIGN KEY (cleared_by) REFERENCES users(id) ON DELETE SET NULL;
