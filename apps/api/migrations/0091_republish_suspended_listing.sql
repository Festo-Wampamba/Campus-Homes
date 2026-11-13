-- Allow landlords to republish a previously approved & suspended listing
-- without re-triggering a new inspection requirement.
CREATE OR REPLACE FUNCTION enforce_listing_intent_change() RETURNS trigger
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
    IF EXISTS (SELECT 1 FROM listings l WHERE l.property_id = NEW.id AND l.status = 'suspended') THEN
      NEW.listing_requested_at := OLD.listing_requested_at;
    ELSE
      NEW.listing_requested_at := now();
    END IF;
  ELSE
    NEW.listing_requested_at := OLD.listing_requested_at;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_listing_intent_on_publish() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  v_intent text;
  v_requested timestamp with time zone;
BEGIN
  IF NEW.status = 'verified' AND (TG_OP = 'INSERT' OR (OLD.status IS DISTINCT FROM 'verified' AND OLD.status IS DISTINCT FROM 'suspended')) THEN
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
  ELSIF NEW.status = 'verified' AND TG_OP = 'UPDATE' AND OLD.status = 'suspended' THEN
    SELECT p.listing_intent INTO v_intent
      FROM properties p WHERE p.id = NEW.property_id FOR SHARE;
    IF v_intent = 'manage_only' THEN
      RAISE EXCEPTION 'listing % cannot be verified: its property is manage-only', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
