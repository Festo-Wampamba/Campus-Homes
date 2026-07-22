-- Normalize admin-managed particulars and make academic periods explicit per university.

UPDATE users
SET gender = lower(trim(gender))
WHERE lower(trim(gender)) IN ('male', 'female');
--> statement-breakpoint
UPDATE users
SET gender = NULL
WHERE gender IS NOT NULL AND gender NOT IN ('male', 'female');
--> statement-breakpoint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_gender_check;
--> statement-breakpoint
ALTER TABLE users ADD CONSTRAINT users_gender_check
  CHECK (gender IS NULL OR gender IN ('male', 'female'));
--> statement-breakpoint

ALTER TABLE semesters ADD COLUMN IF NOT EXISTS university university;
--> statement-breakpoint
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS semester_type text;
--> statement-breakpoint
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS academic_year text;
--> statement-breakpoint
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS custom_name text;
--> statement-breakpoint
ALTER TABLE semesters DROP CONSTRAINT IF EXISTS semesters_type_check;
--> statement-breakpoint
ALTER TABLE semesters ADD CONSTRAINT semesters_type_check
  CHECK (semester_type IS NULL OR semester_type IN ('semester_1', 'semester_2', 'semester_3', 'custom'));
--> statement-breakpoint
ALTER TABLE semesters DROP CONSTRAINT IF EXISTS semesters_custom_name_check;
--> statement-breakpoint
ALTER TABLE semesters ADD CONSTRAINT semesters_custom_name_check
  CHECK (semester_type IS DISTINCT FROM 'custom' OR length(trim(custom_name)) >= 3);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS semesters_university_period_uk
  ON semesters (university, academic_year, semester_type, coalesce(custom_name, ''))
  WHERE university IS NOT NULL AND academic_year IS NOT NULL AND semester_type IS NOT NULL;
