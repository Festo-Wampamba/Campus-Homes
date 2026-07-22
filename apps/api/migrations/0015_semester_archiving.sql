-- Semester removal is recoverable and uses the app_user role's existing,
-- RLS-protected UPDATE privilege rather than expanding DELETE privileges.
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone;
--> statement-breakpoint
DROP INDEX IF EXISTS semesters_university_period_uk;
--> statement-breakpoint
CREATE UNIQUE INDEX semesters_university_period_uk
  ON semesters (university, academic_year, semester_type, coalesce(custom_name, ''))
  WHERE university IS NOT NULL
    AND academic_year IS NOT NULL
    AND semester_type IS NOT NULL
    AND archived_at IS NULL;
