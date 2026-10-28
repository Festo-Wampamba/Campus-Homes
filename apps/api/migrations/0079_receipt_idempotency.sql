-- A retried "Record payment" (lost response, timeout) must not add a second
-- receipt (Codex review, #277). The browser sends one key per payment; the
-- index makes a replay of the same key on the same booking impossible.
ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS idempotency_key text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS payment_receipts_idempotency_uk
  ON payment_receipts (reservation_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
