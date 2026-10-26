-- Management-only landlords (Festo, 2026-10-26; plan in
-- docs/superpowers/specs/2026-10-26-management-only-landlords.md). Each
-- property says whether its landlord wants it listed to students ('list',
-- every existing row) or only managed on CampusHomes ('manage_only').
ALTER TABLE properties
  ADD COLUMN listing_intent text NOT NULL DEFAULT 'list'
  CONSTRAINT properties_listing_intent_chk CHECK (listing_intent IN ('manage_only', 'list'));
--> statement-breakpoint
-- A manage-only property is never shown to students: no listing of it may
-- become verified, whichever path tries (publish, admin, direct SQL).
CREATE FUNCTION enforce_listing_intent_on_publish() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
BEGIN
  IF NEW.status = 'verified' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'verified')
     AND EXISTS (SELECT 1 FROM properties p WHERE p.id = NEW.property_id AND p.listing_intent = 'manage_only') THEN
    RAISE EXCEPTION 'listing % cannot be verified: its property is manage-only', NEW.id
      USING ERRCODE = 'check_violation';
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
-- manage-only (landlords may UPDATE their own row under RLS). Only Ops takes
-- a live listing down first, which AdminPropertiesService.setListingIntent
-- does in the same transaction. SECURITY DEFINER so the check sees every
-- listing of the property regardless of the caller's RLS.
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
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER properties_listing_intent_guard
  BEFORE UPDATE OF listing_intent ON properties
  FOR EACH ROW EXECUTE FUNCTION enforce_listing_intent_change();
