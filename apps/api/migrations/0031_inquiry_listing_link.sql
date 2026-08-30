-- Listing-scoped enquiries: lets a student ask a landlord a question (or
-- request a viewing) about a specific listing WITHOUT first creating a
-- reservation hold. Before this, the only landlord-reachable channel was a
-- chat thread keyed on reservation_id (chat.service.ts ensureThread) — a
-- much bigger commitment than "ask a question," and the generic /inquiries
-- desk (0028) only ever reaches staff, never the landlord.
--
-- Reuses the inquiries table rather than a parallel system: listing_id is
-- optional (existing staff-only inquiries stay listing_id IS NULL), and
-- landlord_id is resolved server-side from the listing at insert time (see
-- InquiriesService.create) — never client-supplied, so a forged landlordId
-- can't misroute an enquiry.
--
-- Column-level grant keeps app_user's blanket UPDATE from 0028 scoped to
-- known columns — but it CANNOT separate "landlord acting as themselves"
-- from "staff resolve() running as service_role", because withRlsContext
-- never SET ROLEs: every context is the single app_user Postgres role,
-- differentiated only by the app.user_role GUC. status/resolution/
-- resolved_by/resolved_at must stay grantable to app_user for the staff
-- resolve() path, which means a landlord's own row-scoped UPDATE would
-- otherwise be free to touch them too. The trigger below is what actually
-- enforces "these columns are staff-authored only" — same pattern as
-- enforce_listing_verification (0001), a DB-level invariant RLS alone can't
-- express.
ALTER TABLE inquiries ADD COLUMN listing_id uuid REFERENCES listings(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE inquiries ADD COLUMN landlord_id uuid REFERENCES users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE inquiries ADD COLUMN landlord_response text;
--> statement-breakpoint
ALTER TABLE inquiries ADD COLUMN landlord_responded_at timestamp with time zone;
--> statement-breakpoint
CREATE INDEX "inquiries_landlord_created_idx" ON "inquiries" USING btree ("landlord_id","created_at");
--> statement-breakpoint
CREATE INDEX "inquiries_listing_idx" ON "inquiries" USING btree ("listing_id");
--> statement-breakpoint

REVOKE UPDATE ON inquiries FROM app_user;
--> statement-breakpoint
GRANT UPDATE (status, resolution, resolved_by, resolved_at, landlord_response, landlord_responded_at, updated_at)
  ON inquiries TO app_user;
--> statement-breakpoint

CREATE POLICY inquiries_landlord_select ON inquiries FOR SELECT
  USING (landlord_id = app_user_id());
--> statement-breakpoint
CREATE POLICY inquiries_landlord_respond ON inquiries FOR UPDATE
  USING (landlord_id = app_user_id())
  WITH CHECK (landlord_id = app_user_id());
--> statement-breakpoint

-- The actual "landlord can only write their own response" boundary: a
-- landlord-context UPDATE that touches anything other than
-- landlord_response/landlord_responded_at is rejected outright, regardless
-- of which row it targets.
CREATE FUNCTION inquiries_guard_landlord_columns() RETURNS trigger
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
    NEW.category IS DISTINCT FROM OLD.category OR
    NEW.subject IS DISTINCT FROM OLD.subject OR
    NEW.message IS DISTINCT FROM OLD.message
  ) THEN
    RAISE EXCEPTION 'landlords may only set landlord_response on an inquiry';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER inquiries_guard_landlord_columns_trigger
  BEFORE UPDATE ON inquiries
  FOR EACH ROW EXECUTE FUNCTION inquiries_guard_landlord_columns();
