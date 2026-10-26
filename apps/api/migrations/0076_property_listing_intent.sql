-- Management-only landlords (Festo, 2026-10-26; plan in
-- docs/superpowers/specs/2026-10-26-management-only-landlords.md). Each
-- property says whether its landlord wants it listed to students ('list',
-- every existing row) or only managed on CampusHomes ('manage_only').
ALTER TABLE properties
  ADD COLUMN listing_intent text NOT NULL DEFAULT 'list'
  CONSTRAINT properties_listing_intent_chk CHECK (listing_intent IN ('manage_only', 'list'));
--> statement-breakpoint
-- When a manage-only property switched (back) to 'list'. Rooms may have been
-- added without a visit while it was manage-only, so it needs an inspection
-- completed after this moment before it can be published. Owned by the
-- trigger below: landlords can UPDATE their own row under RLS.
ALTER TABLE properties ADD COLUMN listing_requested_at timestamp with time zone;
--> statement-breakpoint
-- A listing may become verified only on a 'list' property, and only after an
-- inspection newer than its last switch to 'list'. FOR SHARE on the property
-- row serializes this with a concurrent intent change: whichever commits
-- second sees the first. SECURITY DEFINER so the checks see every row
-- regardless of the caller's RLS.
CREATE FUNCTION enforce_listing_intent_on_publish() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  v_intent text;
  v_requested timestamp with time zone;
BEGIN
  IF NEW.status = 'verified' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'verified') THEN
    SELECT p.listing_intent, p.listing_requested_at INTO v_intent, v_requested
      FROM properties p WHERE p.id = NEW.property_id FOR SHARE;
    IF v_intent = 'manage_only' THEN
      RAISE EXCEPTION 'listing % cannot be verified: its property is manage-only', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_requested IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM verification_visits vv
      WHERE vv.property_id = NEW.property_id AND vv.result = 'passed'
        AND vv.approved_at IS NOT NULL AND vv.completed_at >= v_requested
    ) THEN
      RAISE EXCEPTION 'listing % cannot be verified: no approved inspection since its property switched to listing', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER listings_intent_guard
  BEFORE INSERT OR UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION enforce_listing_intent_on_publish();
--> statement-breakpoint
-- The reverse: a property with a live listing can't quietly become
-- manage-only. Only Ops takes a live listing down first, which
-- AdminPropertiesService.setListingIntent does in the same transaction.
-- Also stamps listing_requested_at on manage_only -> list and keeps every
-- other write from changing it.
CREATE FUNCTION enforce_listing_intent_change() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
BEGIN
  IF NEW.listing_intent = 'manage_only' AND OLD.listing_intent IS DISTINCT FROM 'manage_only'
     AND EXISTS (SELECT 1 FROM listings l WHERE l.property_id = NEW.id AND l.status = 'verified') THEN
    RAISE EXCEPTION 'property % has a live listing and cannot become manage-only', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.listing_intent = 'list' AND OLD.listing_intent = 'manage_only' THEN
    NEW.listing_requested_at := now();
  ELSE
    NEW.listing_requested_at := OLD.listing_requested_at;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER properties_listing_intent_guard
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION enforce_listing_intent_change();
