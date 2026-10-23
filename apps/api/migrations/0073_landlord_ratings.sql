-- Chat and landlord ratings are for students who reserved (Festo, 2026-10-23).
--
-- student_reserved_with_landlord(): a student and a landlord may chat only once
-- the student has reserved at one of the landlord's hostels. Any reservation
-- status counts, so the conversation stays after move-in or a cancellation.
-- Callers run it under service_role: properties/beds/units have no student
-- read policy, so under a student GUC it would always be false.
CREATE FUNCTION student_reserved_with_landlord(p_student uuid, p_landlord uuid) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM reservations r
      JOIN beds b ON b.id = r.bed_id
      JOIN units u ON u.id = b.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE r.student_id = p_student AND p.landlord_id = p_landlord
    )
  $$;
--> statement-breakpoint
-- A student may rate a landlord after reserving with them AND sending them at
-- least one chat message.
CREATE FUNCTION student_can_rate_landlord(p_student uuid, p_landlord uuid) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$
    SELECT student_reserved_with_landlord(p_student, p_landlord)
      AND EXISTS (
        SELECT 1 FROM chat_threads t
        JOIN chat_messages m ON m.thread_id = t.id
        WHERE t.student_id = p_student AND t.landlord_id = p_landlord
          AND m.from_user_id = p_student AND m.deleted_at IS NULL
      )
  $$;
--> statement-breakpoint
-- One rating per student and landlord, append-only (no UPDATE grant), written
-- by the API under service_role. Students read their own; landlords read the
-- ratings about them; public pages get anonymous aggregates via the API.
-- ponytail: no landlord_id index yet; add one when ratings reach thousands.
CREATE TABLE landlord_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord_id uuid NOT NULL REFERENCES landlords(user_id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES students(user_id) ON DELETE RESTRICT,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text CHECK (comment IS NULL OR char_length(comment) BETWEEN 1 AND 1000),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT landlord_ratings_pair_uk UNIQUE (student_id, landlord_id)
);
--> statement-breakpoint
-- Defense in depth: fires for service-role paths too, so an API bug can't
-- record a rating from a student who never reserved and chatted.
CREATE FUNCTION enforce_landlord_rating_eligibility() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NOT student_can_rate_landlord(NEW.student_id, NEW.landlord_id) THEN
    RAISE EXCEPTION 'landlord rating requires a reservation with this landlord and a message sent to them'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER landlord_ratings_eligibility_guard
  BEFORE INSERT ON landlord_ratings
  FOR EACH ROW EXECUTE FUNCTION enforce_landlord_rating_eligibility();
--> statement-breakpoint
ALTER TABLE landlord_ratings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE landlord_ratings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY svc_all ON landlord_ratings FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY landlord_ratings_student_read ON landlord_ratings FOR SELECT USING (student_id = app_user_id());
--> statement-breakpoint
CREATE POLICY landlord_ratings_landlord_read ON landlord_ratings FOR SELECT USING (landlord_id = app_user_id());
--> statement-breakpoint
-- DELETE only for the account purge cascade (svc_all still limits it to
-- service_role), same as 0042.
GRANT SELECT, INSERT, DELETE ON landlord_ratings TO app_user;
