-- A landlord who unpublishes a verified property may put it back themselves,
-- with no new Ops inspection (Festo, 2026-11-15). The marker separates the
-- landlord's own unpublish from an Ops or strike suspension, which stay
-- Ops-only to lift. Only service-role code sets it.
ALTER TABLE listings ADD COLUMN landlord_unpublished_at timestamp with time zone;
--> statement-breakpoint
-- Listings unpublished before this migration: the landlord's unpublish left
-- them suspended on a manage-only property. Skip any property Ops took down
-- (a staff listing-intent change), so that stays Ops-only to restore.
UPDATE listings l SET landlord_unpublished_at = now()
FROM properties p
WHERE p.id = l.property_id AND l.status = 'suspended' AND p.listing_intent = 'manage_only'
  AND EXISTS (SELECT 1 FROM audit_log a
              WHERE a.action = 'property.unpublish' AND a.target_id = p.id AND a.actor_id = p.landlord_id)
  AND NOT EXISTS (SELECT 1 FROM audit_log a
                  WHERE a.action = 'properties.listing_intent' AND a.target_id = p.id AND a.actor_id <> p.landlord_id);
--> statement-breakpoint
-- Same guard as 0076, except a switch back to 'list' that restores a
-- landlord-unpublished listing does not ask for a new inspection.
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
  IF NEW.listing_intent = 'list' AND OLD.listing_intent = 'manage_only'
     AND NOT EXISTS (SELECT 1 FROM listings l WHERE l.property_id = NEW.id
                     AND l.status = 'suspended' AND l.landlord_unpublished_at IS NOT NULL) THEN
    NEW.listing_requested_at := now();
  ELSE
    NEW.listing_requested_at := OLD.listing_requested_at;
  END IF;
  RETURN NEW;
END;
$$;
