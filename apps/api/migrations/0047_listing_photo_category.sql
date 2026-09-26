-- Inspector-captured photos gain a category so the lead reviewing for quality,
-- and the student browsing the listing, see them grouped instead of as one
-- undifferentiated roll.
--
-- Staged photos on verification_visits.photo_storage_keys need no migration:
-- that column is already jsonb, so it carries {storageKey, category} objects
-- alongside the bare strings staged before categories existed. Only the
-- promoted rows in listing_photos need a real column.
--
-- Nullable on purpose: every listing_photos row that already exists was
-- captured before categories, and backfilling them to a guessed category would
-- be inventing data. NULL reads as "uncategorised" in the UI.
CREATE TYPE photo_category AS ENUM (
  'bedroom', 'bathroom', 'kitchen', 'compound', 'shops', 'exterior', 'common_area', 'other'
);
--> statement-breakpoint
ALTER TABLE listing_photos ADD COLUMN category photo_category;
