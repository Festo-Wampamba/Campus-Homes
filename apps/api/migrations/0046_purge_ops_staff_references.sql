-- Hard-deleting a STAFF user (ops inspector/lead) failed with a 500. The purge
-- cascade was built around a landlord target (delete the properties they own
-- and everything under them); a staff member owns no properties, but their
-- ops_staff row carries "actor" references from every property they inspected,
-- approved, verified, or issued a strike on — belonging to OTHER landlords.
--
-- ops_staff.user_id is ON DELETE CASCADE from users, so deleting the user tries
-- to delete their ops_staff row — but every one of these FKs points AT
-- ops_staff.user_id with NO ACTION, so any single inspected visit / verified
-- version / issued strike blocks the whole delete (23503).
--
-- Fix at the referential level, once and for good: these are historical actor
-- links, not ownership. On staff delete the record survives with only its
-- actor anonymized to NULL (same pattern as audit_log/room_management in 0043).
-- A landlord delete still removes these rows via their own property cascade —
-- DELETE takes precedence over SET NULL — so this only changes the staff case.

-- verification_visits: the inspection stays as history; who ran/approved it is nulled.
ALTER TABLE verification_visits ALTER COLUMN inspector_id DROP NOT NULL;
ALTER TABLE verification_visits DROP CONSTRAINT verification_visits_inspector_id_ops_staff_user_id_fk;
ALTER TABLE verification_visits ADD CONSTRAINT verification_visits_inspector_id_ops_staff_user_id_fk
  FOREIGN KEY (inspector_id) REFERENCES ops_staff(user_id) ON DELETE SET NULL;
ALTER TABLE verification_visits DROP CONSTRAINT verification_visits_approved_by_ops_staff_user_id_fk;
ALTER TABLE verification_visits ADD CONSTRAINT verification_visits_approved_by_ops_staff_user_id_fk
  FOREIGN KEY (approved_by) REFERENCES ops_staff(user_id) ON DELETE SET NULL;
--> statement-breakpoint

-- listing_versions / listing_photos: the published snapshot and its photos stay;
-- who verified/captured is nulled.
ALTER TABLE listing_versions ALTER COLUMN verified_by DROP NOT NULL;
ALTER TABLE listing_versions DROP CONSTRAINT listing_versions_verified_by_ops_staff_user_id_fk;
ALTER TABLE listing_versions ADD CONSTRAINT listing_versions_verified_by_ops_staff_user_id_fk
  FOREIGN KEY (verified_by) REFERENCES ops_staff(user_id) ON DELETE SET NULL;
ALTER TABLE listing_photos ALTER COLUMN captured_by DROP NOT NULL;
ALTER TABLE listing_photos DROP CONSTRAINT listing_photos_captured_by_ops_staff_user_id_fk;
ALTER TABLE listing_photos ADD CONSTRAINT listing_photos_captured_by_ops_staff_user_id_fk
  FOREIGN KEY (captured_by) REFERENCES ops_staff(user_id) ON DELETE SET NULL;
--> statement-breakpoint

-- property_documents / move_ins: already-nullable actor links.
ALTER TABLE property_documents DROP CONSTRAINT property_documents_verified_by_ops_staff_user_id_fk;
ALTER TABLE property_documents ADD CONSTRAINT property_documents_verified_by_ops_staff_user_id_fk
  FOREIGN KEY (verified_by) REFERENCES ops_staff(user_id) ON DELETE SET NULL;
ALTER TABLE move_ins DROP CONSTRAINT move_ins_ops_verified_by_ops_staff_user_id_fk;
ALTER TABLE move_ins ADD CONSTRAINT move_ins_ops_verified_by_ops_staff_user_id_fk
  FOREIGN KEY (ops_verified_by) REFERENCES ops_staff(user_id) ON DELETE SET NULL;
--> statement-breakpoint

-- landlord_strikes / student_flags: the strike/flag is retained; the issuing
-- staff member is nulled.
ALTER TABLE landlord_strikes ALTER COLUMN issued_by DROP NOT NULL;
ALTER TABLE landlord_strikes DROP CONSTRAINT landlord_strikes_issued_by_ops_staff_user_id_fk;
ALTER TABLE landlord_strikes ADD CONSTRAINT landlord_strikes_issued_by_ops_staff_user_id_fk
  FOREIGN KEY (issued_by) REFERENCES ops_staff(user_id) ON DELETE SET NULL;
ALTER TABLE student_flags ALTER COLUMN issued_by DROP NOT NULL;
ALTER TABLE student_flags DROP CONSTRAINT student_flags_issued_by_ops_staff_user_id_fk;
ALTER TABLE student_flags ADD CONSTRAINT student_flags_issued_by_ops_staff_user_id_fk
  FOREIGN KEY (issued_by) REFERENCES ops_staff(user_id) ON DELETE SET NULL;
--> statement-breakpoint

-- visit_corrections: the correction record stays; who raised it is nulled.
ALTER TABLE visit_corrections ALTER COLUMN raised_by DROP NOT NULL;
ALTER TABLE visit_corrections DROP CONSTRAINT visit_corrections_raised_by_fkey;
ALTER TABLE visit_corrections ADD CONSTRAINT visit_corrections_raised_by_fkey
  FOREIGN KEY (raised_by) REFERENCES ops_staff(user_id) ON DELETE SET NULL;
