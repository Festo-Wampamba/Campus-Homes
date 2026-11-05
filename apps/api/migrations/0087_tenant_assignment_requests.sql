-- Existing students opt in before a landlord can attach a tenancy to their account.
CREATE TABLE tenant_assignment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(user_id) ON DELETE CASCADE,
  bed_id uuid NOT NULL REFERENCES beds(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  UNIQUE(created_by, idempotency_key)
);
CREATE INDEX tenant_assignment_student_pending ON tenant_assignment_requests(student_id) WHERE status='pending';
ALTER TABLE tenant_assignment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_assignment_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY svc_all ON tenant_assignment_requests FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_assignment_requests TO app_user;
