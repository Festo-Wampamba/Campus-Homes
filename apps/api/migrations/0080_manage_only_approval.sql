-- Ops approval of a management-only property (Festo, 2026-11-01). Ops checks
-- the basics (location, that the landlord runs it) once per property instead
-- of reviewing every room change: after approval the landlord's room changes
-- apply at once. Meaningless on a 'list' property, which goes through the
-- verification visit instead.
ALTER TABLE properties
  ADD COLUMN manage_review_status text NOT NULL DEFAULT 'pending'
  CONSTRAINT properties_manage_review_status_chk CHECK (manage_review_status IN ('pending', 'approved', 'rejected'));
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN manage_reviewed_at timestamp with time zone;
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN manage_reviewed_by uuid REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN manage_rejection_reason text;
--> statement-breakpoint
-- Landlords can INSERT and UPDATE their own property row under RLS, so the
-- review fields are owned by the server: only a service_role write (the Ops
-- approve/reject path, after its staff-scope check) may set them. Any other
-- insert starts pending, any other update keeps them as they were.
CREATE FUNCTION enforce_manage_review_owner() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public
  AS $$
BEGIN
  IF current_setting('app.user_role', true) IS DISTINCT FROM 'service_role' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.manage_review_status := 'pending';
      NEW.manage_reviewed_at := NULL;
      NEW.manage_reviewed_by := NULL;
      NEW.manage_rejection_reason := NULL;
    ELSE
      NEW.manage_review_status := OLD.manage_review_status;
      NEW.manage_reviewed_at := OLD.manage_reviewed_at;
      NEW.manage_reviewed_by := OLD.manage_reviewed_by;
      NEW.manage_rejection_reason := OLD.manage_rejection_reason;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER properties_manage_review_guard
  BEFORE INSERT OR UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION enforce_manage_review_owner();
