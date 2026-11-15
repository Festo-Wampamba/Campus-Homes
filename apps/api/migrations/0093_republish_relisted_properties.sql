-- 0091 only marked listings whose property was still manage-only. A landlord
-- who unpublished before 0091 and then pressed "List this property" is on
-- 'list' with a suspended listing and a fresh listing_requested_at, so the
-- property sat in the Ops queue for a second inspection (Fest courts on
-- staging, 2026-11-15). Mark those listings too, so the landlord republishes
-- them without Ops. Same exclusion as 0091: nothing Ops took down.
UPDATE listings l SET landlord_unpublished_at = now()
FROM properties p
WHERE p.id = l.property_id AND l.status = 'suspended' AND l.landlord_unpublished_at IS NULL
  AND p.listing_intent = 'list'
  AND NOT EXISTS (SELECT 1 FROM listings live WHERE live.property_id = p.id AND live.status = 'verified')
  AND EXISTS (SELECT 1 FROM audit_log a
              WHERE a.action = 'property.unpublish' AND a.target_id = p.id AND a.actor_id = p.landlord_id)
  AND NOT EXISTS (SELECT 1 FROM audit_log a
                  WHERE a.action = 'properties.listing_intent' AND a.target_id = p.id AND a.actor_id <> p.landlord_id);
--> statement-breakpoint
-- Drop the second-inspection request those properties picked up. The guard
-- trigger pins listing_requested_at on every write, so it is off for this
-- one statement.
ALTER TABLE properties DISABLE TRIGGER properties_listing_intent_guard;
--> statement-breakpoint
UPDATE properties p SET listing_requested_at = NULL
WHERE p.listing_requested_at IS NOT NULL AND p.listing_intent = 'list'
  AND EXISTS (SELECT 1 FROM listings l WHERE l.property_id = p.id
              AND l.status = 'suspended' AND l.landlord_unpublished_at IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM listings live WHERE live.property_id = p.id AND live.status = 'verified')
  AND EXISTS (SELECT 1 FROM audit_log a
              WHERE a.action = 'property.unpublish' AND a.target_id = p.id AND a.actor_id = p.landlord_id)
  AND NOT EXISTS (SELECT 1 FROM audit_log a
                  WHERE a.action = 'properties.listing_intent' AND a.target_id = p.id AND a.actor_id <> p.landlord_id);
--> statement-breakpoint
ALTER TABLE properties ENABLE TRIGGER properties_listing_intent_guard;
