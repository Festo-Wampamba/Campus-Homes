-- Offline payments get receipts (Festo, 2026-10-23). A landlord who records a
-- booking fee or deposit (walk-in or a CampusHomes booking, cash or mobile
-- money) creates one receipt row; both the student and the landlord are
-- emailed a copy and can look it up later.
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'cash';
--> statement-breakpoint
CREATE TABLE payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text NOT NULL UNIQUE
    DEFAULT ('CH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES students(user_id) ON DELETE RESTRICT,
  landlord_id uuid NOT NULL REFERENCES landlords(user_id) ON DELETE RESTRICT,
  -- Snapshots: a receipt must read the same after a room is renamed.
  property_name text NOT NULL,
  room_label text NOT NULL,
  booking_fee_ugx integer NOT NULL DEFAULT 0 CHECK (booking_fee_ugx >= 0),
  deposit_ugx integer NOT NULL DEFAULT 0 CHECK (deposit_ugx >= 0),
  payment_method payment_method,
  recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  recorded_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT payment_receipts_amount_chk CHECK (booking_fee_ugx + deposit_ugx > 0)
);
--> statement-breakpoint
CREATE INDEX payment_receipts_landlord_idx ON payment_receipts (landlord_id, recorded_at DESC);
--> statement-breakpoint
CREATE INDEX payment_receipts_student_idx ON payment_receipts (student_id, recorded_at DESC);
--> statement-breakpoint
-- Writes are service-only (ReservationsService.book); each party reads its own.
-- Append-only: no UPDATE grant. DELETE only for the account purge cascade.
ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payment_receipts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY svc_all ON payment_receipts FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY payment_receipts_student_read ON payment_receipts FOR SELECT USING (student_id = app_user_id());
--> statement-breakpoint
CREATE POLICY payment_receipts_landlord_read ON payment_receipts FOR SELECT USING (landlord_id = app_user_id());
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON payment_receipts TO app_user;
--> statement-breakpoint
-- Password resets for any account are a super-admin action only; landlords
-- and students use "Forgot password", Ops asks a super admin.
INSERT INTO permissions (key, description, requires_step_up) VALUES
  ('users.password_reset', 'Set a temporary password for any user who cannot sign in', false)
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description, requires_step_up = EXCLUDED.requires_step_up;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.key = 'users.password_reset'
WHERE r.key = 'super_admin'
ON CONFLICT DO NOTHING;
