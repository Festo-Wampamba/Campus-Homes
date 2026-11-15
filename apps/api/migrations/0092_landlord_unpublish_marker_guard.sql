-- landlord_unpublished_at (0091) must describe the listing's current
-- suspension only. Any status change that does not set the marker itself
-- clears it, so a later Ops publish followed by an Ops or strike suspension
-- can never be lifted by the landlord through a stale marker.
CREATE FUNCTION clear_stale_landlord_unpublish() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.landlord_unpublished_at IS NOT DISTINCT FROM OLD.landlord_unpublished_at THEN
    NEW.landlord_unpublished_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER listings_landlord_unpublish_marker_guard
  BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION clear_stale_landlord_unpublish();
