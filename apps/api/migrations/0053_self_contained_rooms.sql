-- Self-contained vs non-self-contained is a real room attribute students
-- filter on. It was only ever a landlord proposal hint (proposed_room_categories
-- jsonb) + informational property counts — never authoritative on a real room,
-- so search/detail could not surface it. Add it where it belongs: on the
-- physical unit (set by Ops at publish) and on the inspector's per-photo tag.
-- Modeled as a boolean dimension, not new room_category enum values.
ALTER TABLE "units" ADD COLUMN "self_contained" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "listing_photos" ADD COLUMN "self_contained" boolean;
