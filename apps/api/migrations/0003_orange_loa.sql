CREATE TYPE "public"."room_category" AS ENUM('single', 'double', 'triple', 'quad', 'other');--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "proposed_room_categories" jsonb;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "room_category" "room_category" DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "price_per_term_ugx" integer;--> statement-breakpoint
-- Backfill existing rows (dev/seed data only — no production units exist yet)
-- from the listing's current price, so the column can go NOT NULL below.
UPDATE "units" u
SET "price_per_term_ugx" = COALESCE(
  (SELECT lv.price_per_term_ugx
   FROM "listings" l
   JOIN "listing_versions" lv ON lv.id = l.current_version_id
   WHERE l.id = u.listing_id),
  100000
)
WHERE u."price_per_term_ugx" IS NULL;--> statement-breakpoint
ALTER TABLE "units" ALTER COLUMN "price_per_term_ugx" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_price_chk" CHECK ("price_per_term_ugx" > 0);--> statement-breakpoint
-- Category must be explicit going forward; the default above only exists to
-- satisfy NOT NULL for this migration's own backfill.
ALTER TABLE "units" ALTER COLUMN "room_category" DROP DEFAULT;
