-- A landlord can collect rent in more than one way (e.g. per semester OR
-- monthly), so the single-choice rent_period becomes a multi-select array.
-- rent_period stays in place (unused by the app from this release) so an
-- old container still serving during a rolling deploy can keep reading it;
-- drop it in a later migration.
ALTER TABLE properties
  ADD COLUMN rent_periods text[] NOT NULL DEFAULT '{}'::text[];
--> statement-breakpoint

UPDATE properties
SET rent_periods = ARRAY[rent_period]
WHERE rent_period IS NOT NULL AND rent_periods = '{}'::text[];
--> statement-breakpoint

ALTER TABLE properties
  ADD CONSTRAINT properties_rent_periods_valid
  CHECK (rent_periods <@ ARRAY['monthly','per_semester','other']::text[]);
