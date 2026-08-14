-- Phase 1 decision (2026-08-14): reservations are free for now — no live
-- payment gateway is wired up yet, and charging a fee before the site has
-- real traffic just adds friction. reservations.service.ts createHold()
-- skips the whole payment/checkout step whenever the configured fee is 0
-- and creates the reservation straight as 'fulfilled'. 0001_rls_hardening's
-- reservations_fee_chk (`fee_amount_ugx > 0`) predates that decision and
-- would reject every free reservation at the DB layer — relaxed to allow
-- zero. payments_amount_chk (still `amount_ugx > 0`) is untouched: a real
-- payments row is only ever created on the paid branch, where the amount
-- must stay positive.
ALTER TABLE reservations DROP CONSTRAINT reservations_fee_chk;
--> statement-breakpoint
ALTER TABLE reservations ADD CONSTRAINT reservations_fee_chk
  CHECK (fee_amount_ugx >= 0);
