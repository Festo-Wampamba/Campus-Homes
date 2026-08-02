-- Lightweight double-entry ledger: chart of accounts + journal entries/lines.
-- Hold-fee revenue and refunds auto-post from ReservationsService inside the
-- same transaction as the payment/refund row they document; the finance
-- admin records everything else (expenses, payables) by hand. Same posture
-- as roles/staff/activities: svc_all-only RLS, PermissionsGuard is the real
-- gate. journal_entries/journal_lines are append-only at the grant level —
-- corrections are reversing entries, never edits — matching the existing
-- audit_log/reviews/landlord_strikes precedent (0001).
INSERT INTO permissions (key, description, requires_step_up) VALUES
  ('finance.read', 'View the chart of accounts, journal, and P&L/balance sheet reports', false),
  ('finance.manage', 'Manage the chart of accounts and record manual journal entries', false)
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description, requires_step_up = EXCLUDED.requires_step_up;
--> statement-breakpoint

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  ('finance_admin','finance.read'), ('finance_admin','finance.manage'),
  ('platform_admin','finance.read'), ('platform_admin','finance.manage'),
  ('super_admin','finance.read'), ('super_admin','finance.manage'),
  ('auditor','finance.read')
) AS grant_map(role_key, permission_key)
JOIN roles r ON r.key = grant_map.role_key
JOIN permissions p ON p.key = grant_map.permission_key
ON CONFLICT DO NOTHING;
--> statement-breakpoint

CREATE TYPE "public"."ledger_account_type" AS ENUM('asset', 'liability', 'equity', 'revenue', 'expense');
--> statement-breakpoint

CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"account_type" ledger_account_type NOT NULL,
	"parent_id" uuid,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_parent_id_ledger_accounts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_code_uk" ON "ledger_accounts" USING btree ("code");
--> statement-breakpoint

CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_date" date DEFAULT CURRENT_DATE NOT NULL,
	"memo" text NOT NULL,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"reservation_id" uuid,
	"payment_id" uuid,
	"refund_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entries_source_type_check" CHECK ("source_type" IN ('auto', 'manual'))
);
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

CREATE TABLE "journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"debit_ugx" integer DEFAULT 0 NOT NULL,
	"credit_ugx" integer DEFAULT 0 NOT NULL,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_lines_one_side_check" CHECK (("debit_ugx" > 0 AND "credit_ugx" = 0) OR ("credit_ugx" > 0 AND "debit_ugx" = 0))
);
--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "journal_lines_entry_idx" ON "journal_lines" USING btree ("entry_id");
--> statement-breakpoint
CREATE INDEX "journal_lines_account_idx" ON "journal_lines" USING btree ("account_id");
--> statement-breakpoint

-- Every journal entry must net to zero. journal_lines rows for one entry are
-- inserted as several statements inside one transaction, so this has to be a
-- DEFERRED constraint trigger checked once at commit, not a per-row CHECK.
-- Belt-and-suspenders alongside the Zod .refine() on the manual-entry
-- endpoint — this is the DB backstop, matching the house style of
-- DB-enforced money/state invariants (brief: double-booking unique index,
-- payments.provider_txn_id uniqueness, the verification-checklist trigger).
CREATE FUNCTION check_journal_entry_balanced() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  target_entry_id uuid := COALESCE(NEW.entry_id, OLD.entry_id);
  imbalance integer;
BEGIN
  SELECT COALESCE(SUM(debit_ugx - credit_ugx), 0) INTO imbalance
  FROM journal_lines WHERE entry_id = target_entry_id;
  IF imbalance <> 0 THEN
    RAISE EXCEPTION 'journal entry % is not balanced (debits - credits = %)', target_entry_id, imbalance
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER journal_lines_balanced
  AFTER INSERT OR UPDATE OR DELETE ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_journal_entry_balanced();
--> statement-breakpoint

INSERT INTO ledger_accounts (code, name, account_type, is_system, description) VALUES
  ('1000', 'Cash and Mobile Money', 'asset', true, 'Cash settled via mobile money/card for collected hold fees.'),
  ('2000', 'Accounts Payable', 'liability', true, 'Amounts owed to vendors or landlords, recorded manually.'),
  ('3000', 'Retained Earnings', 'equity', true, 'Synthetic — computed from cumulative net income; never posted to directly.'),
  ('4000', 'Hold Fee Revenue', 'revenue', true, 'Reservation hold fees collected from students.'),
  ('4900', 'Refunds and Cancellations', 'revenue', true, 'Contra-revenue: refunds of hold fees.'),
  ('5000', 'Operating Expenses', 'expense', true, 'Parent account for manually recorded operating expense sub-accounts.')
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint

ALTER TABLE ledger_accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY svc_all ON ledger_accounts FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON ledger_accounts TO app_user;
--> statement-breakpoint

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY svc_all ON journal_entries FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
GRANT SELECT, INSERT ON journal_entries TO app_user;
--> statement-breakpoint

ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY svc_all ON journal_lines FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
GRANT SELECT, INSERT ON journal_lines TO app_user;
