-- R18: a student can attach one of their own reservations to a support
-- inquiry, so staff know which booking the question is about.
--
-- Ownership is checked in InquiriesService.create, inside the student's own
-- RLS transaction (reservations_student_read only returns their rows), so
-- another student's reservation id is rejected before the insert.
ALTER TABLE inquiries ADD COLUMN reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL;
--> statement-breakpoint

-- 0043 grants app_user table-wide UPDATE on inquiries, so the landlord
-- column guard (0031) is the only thing stopping a landlord-context UPDATE
-- from re-pointing reservation_id. Same function, one more column. Kept
-- landlord-only like the rest: ON DELETE SET NULL above fires this trigger.
CREATE OR REPLACE FUNCTION inquiries_guard_landlord_columns() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF app_role() = 'landlord' AND (
    NEW.status IS DISTINCT FROM OLD.status OR
    NEW.resolution IS DISTINCT FROM OLD.resolution OR
    NEW.resolved_by IS DISTINCT FROM OLD.resolved_by OR
    NEW.resolved_at IS DISTINCT FROM OLD.resolved_at OR
    NEW.student_id IS DISTINCT FROM OLD.student_id OR
    NEW.listing_id IS DISTINCT FROM OLD.listing_id OR
    NEW.landlord_id IS DISTINCT FROM OLD.landlord_id OR
    NEW.reservation_id IS DISTINCT FROM OLD.reservation_id OR
    NEW.category IS DISTINCT FROM OLD.category OR
    NEW.subject IS DISTINCT FROM OLD.subject OR
    NEW.message IS DISTINCT FROM OLD.message
  ) THEN
    RAISE EXCEPTION 'landlords may only set landlord_response on an inquiry';
  END IF;
  RETURN NEW;
END;
$$;
