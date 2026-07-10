-- ═══════════════════════════════════════════════════════════════════════════
-- CampusHomes — RLS, integrity triggers, PostGIS, and grants.
-- Deny by default, grant narrowly (build brief §8).
--
-- Runtime identity model:
--   * The API connects as a role that inherits `app_user` (never the table
--     owner, never a superuser), so every policy below applies to it.
--   * A NestJS interceptor sets `app.user_id` / `app.user_role` per request
--     via set_config(..., true) inside a transaction (see src/db/rls-context.ts).
--   * `service_role` is reserved for server-internal paths (webhooks, jobs).
--     It is never derived from client input.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint

-- ── Identity helpers ─────────────────────────────────────────────────────────
-- current_setting(..., true) returns NULL when unset → every policy fails
-- closed for a request that never authenticated.

CREATE FUNCTION app_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint

CREATE FUNCTION app_role() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_role', true), '') $$;
--> statement-breakpoint

CREATE FUNCTION app_is_ops() RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT app_role() IN ('ops_inspector', 'ops_lead', 'admin') $$;
--> statement-breakpoint

CREATE FUNCTION app_is_lead() RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT app_role() IN ('ops_lead', 'admin') $$;
--> statement-breakpoint

CREATE FUNCTION app_is_service() RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT app_role() = 'service_role' $$;
--> statement-breakpoint

-- ── CHECK constraints the ORM can't express ─────────────────────────────────

ALTER TABLE students ADD CONSTRAINT students_year_chk
  CHECK (year_of_study IS NULL OR year_of_study BETWEEN 1 AND 6);
--> statement-breakpoint
ALTER TABLE listing_versions ADD CONSTRAINT listing_versions_price_chk
  CHECK (price_per_term_ugx > 0);
--> statement-breakpoint
ALTER TABLE reservations ADD CONSTRAINT reservations_fee_chk
  CHECK (fee_amount_ugx > 0);
--> statement-breakpoint
ALTER TABLE payments ADD CONSTRAINT payments_amount_chk
  CHECK (amount_ugx > 0);
--> statement-breakpoint
ALTER TABLE refunds ADD CONSTRAINT refunds_amount_chk
  CHECK (amount_ugx > 0);
--> statement-breakpoint
ALTER TABLE reviews ADD CONSTRAINT reviews_rating_chk
  CHECK (overall_rating BETWEEN 1 AND 5);
--> statement-breakpoint
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_body_chk
  CHECK (char_length(body) <= 2000);
--> statement-breakpoint

-- ── PostGIS generated point + spatial index (student map search) ────────────

ALTER TABLE properties ADD COLUMN gps_point geometry(Point, 4326)
  GENERATED ALWAYS AS (
    CASE WHEN gps_lat IS NOT NULL AND gps_lon IS NOT NULL
      THEN ST_SetSRID(ST_MakePoint(gps_lon::float8, gps_lat::float8), 4326)
    END
  ) STORED;
--> statement-breakpoint
CREATE INDEX properties_gps_point_gist ON properties USING gist (gps_point);
--> statement-breakpoint

-- Circular FK drizzle can't model: listings.current_version_id → listing_versions.
ALTER TABLE listings ADD CONSTRAINT listings_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES listing_versions(id);
--> statement-breakpoint

-- ── Integrity triggers ───────────────────────────────────────────────────────

-- THE 6-component invariant (brief §7): a listing may only become `verified`
-- when its property has a passed visit, approved by an ops lead, whose
-- checklist contains all six components with passed = true.
-- Component keys mirror VERIFICATION_CHECKLIST_COMPONENTS in packages/shared.
CREATE FUNCTION enforce_listing_verification() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW.status = 'verified' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'verified') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM verification_visits vv
      JOIN ops_staff approver ON approver.user_id = vv.approved_by AND approver.team = 'lead'
      WHERE vv.property_id = NEW.property_id
        AND vv.result = 'passed'
        AND vv.approved_at IS NOT NULL
        AND (
          SELECT bool_and(
            vv.checklist ? c AND vv.checklist -> c ->> 'passed' = 'true'
          )
          FROM unnest(ARRAY[
            'location_gps', 'rooms_capacity', 'amenities',
            'photos', 'landlord_identity', 'safety'
          ]) AS c
        )
    ) THEN
      RAISE EXCEPTION 'listing % cannot be verified: no lead-approved visit with a complete 6-component checklist', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER listings_verification_guard
  BEFORE INSERT OR UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION enforce_listing_verification();
--> statement-breakpoint

-- Reviews only ever come from the student who fulfilled the reservation.
-- (RLS enforces this for API traffic; the trigger also covers service paths.)
CREATE FUNCTION enforce_review_eligibility() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM reservations r
    WHERE r.id = NEW.reservation_id
      AND r.status = 'fulfilled'
      AND r.student_id = NEW.student_id
  ) THEN
    RAISE EXCEPTION 'review requires a fulfilled reservation owned by the reviewing student'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER reviews_eligibility_guard
  BEFORE INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION enforce_review_eligibility();
--> statement-breakpoint

-- 3 strikes → suspend the landlord and every verified listing they own.
CREATE FUNCTION enforce_strike_suspension() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF (SELECT count(*) FROM landlord_strikes WHERE landlord_id = NEW.landlord_id) >= 3 THEN
    UPDATE users SET status = 'suspended' WHERE id = NEW.landlord_id;
    UPDATE listings SET status = 'suspended'
      WHERE status = 'verified'
        AND property_id IN (SELECT id FROM properties WHERE landlord_id = NEW.landlord_id);
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER landlord_strikes_suspension
  AFTER INSERT ON landlord_strikes
  FOR EACH ROW EXECUTE FUNCTION enforce_strike_suspension();
--> statement-breakpoint

CREATE FUNCTION set_updated_at() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
--> statement-breakpoint
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER reservations_updated_at BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- ── Reputation (materialized view — refreshed by job, system-only writes) ───

CREATE MATERIALIZED VIEW reputation_scores AS
  WITH review_targets AS (
    SELECT
      rv.id AS review_id,
      rv.overall_rating,
      rv.amenity_match,
      l.property_id,
      p.landlord_id
    FROM reviews rv
    JOIN listing_versions lv ON lv.id = rv.listing_version_id
    JOIN listings l ON l.id = lv.listing_id
    JOIN properties p ON p.id = l.property_id
  ),
  mismatch AS (
    SELECT
      review_id,
      (SELECT count(*) FILTER (WHERE value ->> 'matched' = 'false')::numeric
         / nullif(count(*), 0)
       FROM jsonb_each(amenity_match)) AS mismatch_rate
    FROM review_targets
  ),
  scored AS (
    SELECT 'property'::reputation_subject_type AS subject_type, rt.property_id AS subject_id,
           rt.overall_rating, m.mismatch_rate
    FROM review_targets rt JOIN mismatch m ON m.review_id = rt.review_id
    UNION ALL
    SELECT 'landlord'::reputation_subject_type, rt.landlord_id,
           rt.overall_rating, m.mismatch_rate
    FROM review_targets rt JOIN mismatch m ON m.review_id = rt.review_id
  )
  SELECT
    subject_type,
    subject_id,
    round(avg(overall_rating)::numeric, 2) AS average_rating,
    count(*)::integer AS total_reviews,
    round(coalesce(avg(mismatch_rate), 0), 4) AS amenity_mismatch_rate,
    now() AS last_updated,
    (avg(overall_rating) < 3.0 AND count(*) >= 5) AS break_flag
  FROM scored
  GROUP BY subject_type, subject_id;
--> statement-breakpoint
CREATE UNIQUE INDEX reputation_scores_subject_uk
  ON reputation_scores (subject_type, subject_id);
--> statement-breakpoint

-- ── Runtime role & table grants (defense in depth under RLS) ────────────────

DO $$ BEGIN
  CREATE ROLE app_user NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_user;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_user;
--> statement-breakpoint
-- Append-only / immutable surfaces: strip writes the app must never perform,
-- regardless of what any future RLS policy accidentally allows.
REVOKE UPDATE ON audit_log, reviews, landlord_strikes, student_flags, listing_photos FROM app_user;
--> statement-breakpoint
REVOKE INSERT, UPDATE ON spatial_ref_sys FROM app_user;
--> statement-breakpoint
GRANT DELETE ON push_subscriptions TO app_user;
--> statement-breakpoint
GRANT SELECT ON reputation_scores TO app_user;
--> statement-breakpoint

-- ── Row-Level Security: enable on every table ────────────────────────────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE landlords ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ops_staff ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE verification_tokens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE semesters ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE property_documents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE verification_visits ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE listing_versions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE listing_photos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE move_ins ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE landlord_strikes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE student_flags ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ── service_role: unrestricted on every table (server-internal paths only) ──

CREATE POLICY svc_all ON users FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON students FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON landlords FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON ops_staff FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON sessions FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON verification_tokens FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON semesters FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON properties FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON property_documents FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON verification_visits FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON listings FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON listing_versions FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON listing_photos FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON units FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON reservations FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON payments FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON refunds FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON move_ins FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON reviews FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON landlord_strikes FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON student_flags FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON audit_log FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON chat_threads FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON chat_messages FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON notification_templates FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON notifications FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON push_subscriptions FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint

-- ── Per-role policies (brief §8 matrix) ──────────────────────────────────────

-- users: read own row; ops_lead/admin read all. Writes are service-only —
-- a user-editable `users` row would let a client touch `role`/`status`.
CREATE POLICY users_read ON users FOR SELECT
  USING (id = app_user_id() OR app_is_lead());
--> statement-breakpoint

-- students / landlords / ops_staff: own row; ops_lead reads all.
CREATE POLICY students_read ON students FOR SELECT
  USING (user_id = app_user_id() OR app_is_lead());
--> statement-breakpoint
CREATE POLICY students_self_insert ON students FOR INSERT
  WITH CHECK (user_id = app_user_id() AND app_role() = 'student');
--> statement-breakpoint
CREATE POLICY students_self_update ON students FOR UPDATE
  USING (user_id = app_user_id())
  WITH CHECK (user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY landlords_read ON landlords FOR SELECT
  USING (user_id = app_user_id() OR app_is_lead());
--> statement-breakpoint
CREATE POLICY landlords_self_insert ON landlords FOR INSERT
  WITH CHECK (user_id = app_user_id() AND app_role() = 'landlord');
--> statement-breakpoint
-- KYC decisions are ops-written via service paths; a landlord may only edit
-- their profile row while KYC is still pending (can't touch a verified row).
CREATE POLICY landlords_self_update ON landlords FOR UPDATE
  USING (user_id = app_user_id() AND kyc_status = 'pending')
  WITH CHECK (user_id = app_user_id() AND kyc_status = 'pending');
--> statement-breakpoint
CREATE POLICY ops_staff_read ON ops_staff FOR SELECT
  USING (user_id = app_user_id() OR app_is_lead());
--> statement-breakpoint

-- sessions / verification_tokens: service-role only — no user policies at all.

-- semesters: world-readable reference data.
CREATE POLICY semesters_read ON semesters FOR SELECT USING (true);
--> statement-breakpoint

-- properties: owning landlord + ops read; landlord creates/edits own.
CREATE POLICY properties_read ON properties FOR SELECT
  USING (landlord_id = app_user_id() OR app_is_ops());
--> statement-breakpoint
CREATE POLICY properties_landlord_insert ON properties FOR INSERT
  WITH CHECK (landlord_id = app_user_id() AND app_role() = 'landlord');
--> statement-breakpoint
CREATE POLICY properties_landlord_update ON properties FOR UPDATE
  USING (landlord_id = app_user_id())
  WITH CHECK (landlord_id = app_user_id());
--> statement-breakpoint
CREATE POLICY properties_ops_update ON properties FOR UPDATE
  USING (app_is_ops())
  WITH CHECK (app_is_ops());
--> statement-breakpoint

-- property_documents: owner landlord + ops read; owner uploads; ops verifies.
CREATE POLICY property_documents_read ON property_documents FOR SELECT
  USING (
    app_is_ops()
    OR EXISTS (SELECT 1 FROM properties p
               WHERE p.id = property_id AND p.landlord_id = app_user_id())
  );
--> statement-breakpoint
CREATE POLICY property_documents_landlord_insert ON property_documents FOR INSERT
  WITH CHECK (
    uploaded_by = app_user_id()
    AND EXISTS (SELECT 1 FROM properties p
                WHERE p.id = property_id AND p.landlord_id = app_user_id())
  );
--> statement-breakpoint
CREATE POLICY property_documents_ops_update ON property_documents FOR UPDATE
  USING (app_is_ops()) WITH CHECK (app_is_ops());
--> statement-breakpoint

-- verification_visits: assigned inspector writes their own visit;
-- ops_lead sees and approves everything.
CREATE POLICY visits_read ON verification_visits FOR SELECT
  USING (inspector_id = app_user_id() OR app_is_lead());
--> statement-breakpoint
CREATE POLICY visits_lead_insert ON verification_visits FOR INSERT
  WITH CHECK (app_is_lead());
--> statement-breakpoint
CREATE POLICY visits_inspector_update ON verification_visits FOR UPDATE
  USING (inspector_id = app_user_id() AND app_role() = 'ops_inspector')
  WITH CHECK (inspector_id = app_user_id());
--> statement-breakpoint
CREATE POLICY visits_lead_update ON verification_visits FOR UPDATE
  USING (app_is_lead()) WITH CHECK (app_is_lead());
--> statement-breakpoint

-- listings: the public sees only verified; a landlord also sees their own
-- drafts; ops sees all. Landlords may create/edit drafts on their own
-- property but can never set `verified` (status is whitelisted below, and
-- the verification trigger guards the flip independently).
CREATE POLICY listings_read ON listings FOR SELECT
  USING (
    status = 'verified'
    OR app_is_ops()
    OR EXISTS (SELECT 1 FROM properties p
               WHERE p.id = property_id AND p.landlord_id = app_user_id())
  );
--> statement-breakpoint
CREATE POLICY listings_landlord_insert ON listings FOR INSERT
  WITH CHECK (
    status IN ('draft', 'pending_verification')
    AND EXISTS (SELECT 1 FROM properties p
                WHERE p.id = property_id AND p.landlord_id = app_user_id())
  );
--> statement-breakpoint
CREATE POLICY listings_landlord_update ON listings FOR UPDATE
  USING (
    status IN ('draft', 'pending_verification')
    AND EXISTS (SELECT 1 FROM properties p
                WHERE p.id = property_id AND p.landlord_id = app_user_id())
  )
  WITH CHECK (
    status IN ('draft', 'pending_verification')
    AND EXISTS (SELECT 1 FROM properties p
                WHERE p.id = property_id AND p.landlord_id = app_user_id())
  );
--> statement-breakpoint
CREATE POLICY listings_lead_update ON listings FOR UPDATE
  USING (app_is_lead()) WITH CHECK (app_is_lead());
--> statement-breakpoint

-- listing_versions / listing_photos: public read via verified parent;
-- landlord reads own; writes are ops-lead/service only (publish path).
CREATE POLICY listing_versions_read ON listing_versions FOR SELECT
  USING (
    app_is_ops()
    OR EXISTS (
      SELECT 1 FROM listings l
      WHERE l.id = listing_id
        AND (l.status = 'verified'
             OR EXISTS (SELECT 1 FROM properties p
                        WHERE p.id = l.property_id AND p.landlord_id = app_user_id()))
    )
  );
--> statement-breakpoint
CREATE POLICY listing_versions_lead_insert ON listing_versions FOR INSERT
  WITH CHECK (app_is_lead());
--> statement-breakpoint
CREATE POLICY listing_versions_lead_update ON listing_versions FOR UPDATE
  USING (app_is_lead()) WITH CHECK (app_is_lead());
--> statement-breakpoint
CREATE POLICY listing_photos_read ON listing_photos FOR SELECT
  USING (
    app_is_ops()
    OR EXISTS (
      SELECT 1 FROM listing_versions lv
      JOIN listings l ON l.id = lv.listing_id
      WHERE lv.id = listing_version_id
        AND (l.status = 'verified'
             OR EXISTS (SELECT 1 FROM properties p
                        WHERE p.id = l.property_id AND p.landlord_id = app_user_id()))
    )
  );
--> statement-breakpoint
CREATE POLICY listing_photos_ops_insert ON listing_photos FOR INSERT
  WITH CHECK (app_is_ops() AND captured_by = app_user_id());
--> statement-breakpoint

-- units: readable wherever the parent listing is readable; ops manages.
CREATE POLICY units_read ON units FOR SELECT
  USING (
    app_is_ops()
    OR EXISTS (
      SELECT 1 FROM listings l
      WHERE l.id = listing_id
        AND (l.status = 'verified'
             OR EXISTS (SELECT 1 FROM properties p
                        WHERE p.id = l.property_id AND p.landlord_id = app_user_id()))
    )
  );
--> statement-breakpoint
CREATE POLICY units_ops_insert ON units FOR INSERT WITH CHECK (app_is_ops());
--> statement-breakpoint
CREATE POLICY units_ops_update ON units FOR UPDATE
  USING (app_is_ops()) WITH CHECK (app_is_ops());
--> statement-breakpoint

-- reservations: student reads own; the unit's landlord reads (status only —
-- payment detail lives in `payments`, which landlords cannot read at all);
-- ops_lead reads all. All writes go through service_role (state machine).
CREATE POLICY reservations_student_read ON reservations FOR SELECT
  USING (student_id = app_user_id());
--> statement-breakpoint
CREATE POLICY reservations_landlord_read ON reservations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN listings l ON l.id = u.listing_id
      JOIN properties p ON p.id = l.property_id
      WHERE u.id = unit_id AND p.landlord_id = app_user_id()
    )
  );
--> statement-breakpoint
CREATE POLICY reservations_lead_read ON reservations FOR SELECT
  USING (app_is_lead());
--> statement-breakpoint

-- payments: the paying student and ops_lead only. Landlords never.
CREATE POLICY payments_student_read ON payments FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM reservations r
            WHERE r.id = reservation_id AND r.student_id = app_user_id())
  );
--> statement-breakpoint
CREATE POLICY payments_lead_read ON payments FOR SELECT
  USING (app_is_lead());
--> statement-breakpoint

-- refunds: owning student reads; ops_lead inserts/updates.
CREATE POLICY refunds_student_read ON refunds FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM reservations r
            WHERE r.id = reservation_id AND r.student_id = app_user_id())
  );
--> statement-breakpoint
CREATE POLICY refunds_lead_all ON refunds FOR ALL
  USING (app_is_lead()) WITH CHECK (app_is_lead());
--> statement-breakpoint

-- move_ins: both parties read; writes via service (confirmation state machine).
CREATE POLICY move_ins_read ON move_ins FOR SELECT
  USING (
    app_is_lead()
    OR EXISTS (SELECT 1 FROM reservations r
               WHERE r.id = reservation_id AND r.student_id = app_user_id())
    OR EXISTS (
      SELECT 1 FROM reservations r
      JOIN units u ON u.id = r.unit_id
      JOIN listings l ON l.id = u.listing_id
      JOIN properties p ON p.id = l.property_id
      WHERE r.id = reservation_id AND p.landlord_id = app_user_id()
    )
  );
--> statement-breakpoint

-- reviews: public read (the trust promise); insert only by the fulfilled
-- reservation's student (trigger re-checks). Never updatable.
CREATE POLICY reviews_read ON reviews FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY reviews_student_insert ON reviews FOR INSERT
  WITH CHECK (
    student_id = app_user_id()
    AND EXISTS (SELECT 1 FROM reservations r
                WHERE r.id = reservation_id
                  AND r.student_id = app_user_id()
                  AND r.status = 'fulfilled')
  );
--> statement-breakpoint

-- landlord_strikes / student_flags: subject reads own; ops_lead writes.
CREATE POLICY strikes_read ON landlord_strikes FOR SELECT
  USING (landlord_id = app_user_id() OR app_is_lead());
--> statement-breakpoint
CREATE POLICY strikes_lead_insert ON landlord_strikes FOR INSERT
  WITH CHECK (app_is_lead() AND issued_by = app_user_id());
--> statement-breakpoint
CREATE POLICY flags_read ON student_flags FOR SELECT
  USING (student_id = app_user_id() OR app_is_lead());
--> statement-breakpoint
CREATE POLICY flags_lead_insert ON student_flags FOR INSERT
  WITH CHECK (app_is_lead() AND issued_by = app_user_id());
--> statement-breakpoint

-- audit_log: ops_lead/admin read; inserts via service only; append-only
-- (UPDATE/DELETE also revoked at the grant level above).
CREATE POLICY audit_log_lead_read ON audit_log FOR SELECT
  USING (app_is_lead());
--> statement-breakpoint

-- chat: thread participants only; ops reads for audit.
CREATE POLICY chat_threads_read ON chat_threads FOR SELECT
  USING (student_id = app_user_id() OR landlord_id = app_user_id() OR app_is_ops());
--> statement-breakpoint
CREATE POLICY chat_messages_read ON chat_messages FOR SELECT
  USING (
    app_is_ops()
    OR EXISTS (SELECT 1 FROM chat_threads t
               WHERE t.id = thread_id
                 AND (t.student_id = app_user_id() OR t.landlord_id = app_user_id()))
  );
--> statement-breakpoint
CREATE POLICY chat_messages_participant_insert ON chat_messages FOR INSERT
  WITH CHECK (
    from_user_id = app_user_id()
    AND EXISTS (SELECT 1 FROM chat_threads t
                WHERE t.id = thread_id
                  AND (t.student_id = app_user_id() OR t.landlord_id = app_user_id()))
  );
--> statement-breakpoint
CREATE POLICY chat_messages_participant_update ON chat_messages FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM chat_threads t
            WHERE t.id = thread_id
              AND (t.student_id = app_user_id() OR t.landlord_id = app_user_id()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM chat_threads t
            WHERE t.id = thread_id
              AND (t.student_id = app_user_id() OR t.landlord_id = app_user_id()))
  );
--> statement-breakpoint

-- notifications: recipient reads own and may mark read; inserts via service.
CREATE POLICY notification_templates_read ON notification_templates FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY notifications_read ON notifications FOR SELECT
  USING (user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY notifications_self_update ON notifications FOR UPDATE
  USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());
--> statement-breakpoint

-- push_subscriptions: user manages own devices.
CREATE POLICY push_subs_read ON push_subscriptions FOR SELECT
  USING (user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY push_subs_self_insert ON push_subscriptions FOR INSERT
  WITH CHECK (user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY push_subs_self_update ON push_subscriptions FOR UPDATE
  USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY push_subs_self_delete ON push_subscriptions FOR DELETE
  USING (user_id = app_user_id());
