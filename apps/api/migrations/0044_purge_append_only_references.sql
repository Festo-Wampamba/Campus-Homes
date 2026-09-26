-- The initial hard-purge grants (0042/0043) accidentally made two historical
-- tables mutable: journal_entries and reservation_releases. Both are
-- deliberately append-only, including for service_role. Preserve those rows
-- instead and let referential actions detach the deleted operational record
-- or actor. This is the same pattern used for audit_log in 0043.

-- A journal entry may document an account or reservation that has subsequently
-- been purged. Financial history remains intact, with only its former source
-- link anonymized.
ALTER TABLE journal_entries DROP CONSTRAINT journal_entries_reservation_id_reservations_id_fk;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_reservation_id_reservations_id_fk
  FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL;
ALTER TABLE journal_entries DROP CONSTRAINT journal_entries_payment_id_payments_id_fk;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_payment_id_payments_id_fk
  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL;
ALTER TABLE journal_entries DROP CONSTRAINT journal_entries_refund_id_refunds_id_fk;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_refund_id_refunds_id_fk
  FOREIGN KEY (refund_id) REFERENCES refunds(id) ON DELETE SET NULL;
--> statement-breakpoint

-- A release is immutable operational history. Both of its user-facing links
-- are nullable after a permanent purge, while its reason/timing remain.
ALTER TABLE reservation_releases ALTER COLUMN reservation_id DROP NOT NULL;
ALTER TABLE reservation_releases DROP CONSTRAINT reservation_releases_reservation_id_reservations_id_fk;
ALTER TABLE reservation_releases ADD CONSTRAINT reservation_releases_reservation_id_reservations_id_fk
  FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL;
ALTER TABLE reservation_releases DROP CONSTRAINT reservation_releases_released_by_users_id_fk;
ALTER TABLE reservation_releases ADD CONSTRAINT reservation_releases_released_by_users_id_fk
  FOREIGN KEY (released_by) REFERENCES users(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Undo the over-broad grants from 0042/0043. RLS still protects all purge
-- operations, but append-only enforcement also requires these privileges to
-- be absent even when the app is executing with service_role context.
REVOKE DELETE ON journal_entries FROM app_user;
REVOKE UPDATE ON reservation_releases FROM app_user;
