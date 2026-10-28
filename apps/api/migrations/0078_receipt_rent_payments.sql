-- Later payments (Festo, 2026-10-28): after booking, a landlord records each
-- rent instalment a student pays (cash or mobile money). Each one is its own
-- receipt; Paid = every receipt for the booking, Balance = rent - Paid.
ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS rent_ugx integer NOT NULL DEFAULT 0
  CONSTRAINT payment_receipts_rent_chk CHECK (rent_ugx >= 0);
--> statement-breakpoint
ALTER TABLE payment_receipts DROP CONSTRAINT IF EXISTS payment_receipts_amount_chk;
--> statement-breakpoint
ALTER TABLE payment_receipts ADD CONSTRAINT payment_receipts_amount_chk
  CHECK (booking_fee_ugx + deposit_ugx + rent_ugx > 0);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS payment_receipts_reservation_idx ON payment_receipts (reservation_id);
