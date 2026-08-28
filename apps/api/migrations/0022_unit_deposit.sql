-- Deposit was missing from the data model entirely — only rent
-- (price_per_term_ugx) and property-level utilities existed. Same
-- ownership as price: Ops sets the authoritative value on `units` at
-- publish time (or admin's direct unit-entry path); the landlord's
-- proposed_room_categories on `properties` carries their own proposed
-- figure informationally, same as it already does for price.
ALTER TABLE units ADD COLUMN deposit_ugx integer;
--> statement-breakpoint
ALTER TABLE units ADD CONSTRAINT units_deposit_chk CHECK (deposit_ugx >= 0);
