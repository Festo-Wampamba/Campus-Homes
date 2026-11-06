-- Property-scoped bookkeeping profiles are never login identities.
ALTER TABLE users ADD COLUMN contact_email text;
ALTER TABLE users ADD COLUMN tenancy_property_id uuid REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE users ADD CONSTRAINT users_tenancy_no_login CHECK (
  tenancy_property_id IS NULL OR (phone IS NULL AND email IS NULL AND logto_user_id IS NULL)
);
CREATE INDEX users_tenancy_property_idx ON users(tenancy_property_id) WHERE tenancy_property_id IS NOT NULL;
ALTER TABLE reservations ADD COLUMN intake_fingerprint text;
