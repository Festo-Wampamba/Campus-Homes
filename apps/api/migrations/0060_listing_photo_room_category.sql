-- Which room type a verification photo belongs to (e.g. the en-suite
-- bathroom of the single self-contained rooms), independent of what the
-- photo shows (`category`). Lets the listing page show each room type only
-- its own photos. NULL = a whole-property photo.
ALTER TABLE listing_photos ADD COLUMN room_category room_category;
