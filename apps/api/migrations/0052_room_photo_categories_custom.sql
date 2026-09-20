-- Bed-count photo categories + free-text custom fallback (inspector photo
-- tagger), and a free-text room-type label for the 'other' unit category.
-- Unit bed counts (single/double/triple/quad) already exist in room_category;
-- only the custom label is new there.
ALTER TYPE "photo_category" ADD VALUE IF NOT EXISTS 'single_bedroom';
--> statement-breakpoint
ALTER TYPE "photo_category" ADD VALUE IF NOT EXISTS 'double_bedroom';
--> statement-breakpoint
ALTER TYPE "photo_category" ADD VALUE IF NOT EXISTS 'triple_bedroom';
--> statement-breakpoint
ALTER TYPE "photo_category" ADD VALUE IF NOT EXISTS 'custom';
--> statement-breakpoint
ALTER TABLE "listing_photos" ADD COLUMN "custom_label" text;
--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "room_category_label" text;
