-- Declaration/consent was previously not captured at all on a tenant
-- agreement submission (only the signature was). It's fixed, platform-wide
-- wording (TENANT_AGREEMENT_DECLARATION_TEXT in shared) — not a
-- landlord-configurable template field, same posture as signature — so it
-- lives as its own column rather than a tenant_agreement_fields row.
-- Existing rows predate the declaration step and are backfilled true (they
-- were submitted under the old flow, not a real absence of consent);
-- the column then defaults false going forward and the submit schema's
-- z.literal(true) is what actually enforces it on new submissions.
ALTER TABLE tenant_agreements ADD COLUMN "declaration_accepted" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE tenant_agreements SET declaration_accepted = true;
