-- Quad rooms (4 beds) already exist in room_category; the inspector photo
-- tagger only offered single/double/triple bedroom categories.
ALTER TYPE "photo_category" ADD VALUE IF NOT EXISTS 'quad_bedroom';
