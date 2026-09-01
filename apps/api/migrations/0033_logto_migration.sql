-- Better Auth -> self-hosted Logto swap (full reset, not phased/JIT — see
-- docs/superpowers/plans/you-are-a-principal-lucky-alpaca.md for the
-- superseded phased design, and the approved plan for what replaced it).
--
-- accounts/verifications (100% Better-Auth-owned: password hashes, OAuth
-- tokens, OTP values) are dropped outright — every credential is reset,
-- everyone re-authenticates fresh through Logto. Dropping a table drops its
-- policies with it, so no separate DROP POLICY statements are needed.
--
-- users rows, their role/status, and every table FK'd to users.id (~48
-- tables: properties, reservations, chat, audit_log, etc.) are deliberately
-- left untouched — this resets credentials, not the platform's data.
--
-- verification_tokens (the original design-doc table) was never used by
-- Better Auth and has zero readers/writers anywhere in the codebase
-- (confirmed by grep before writing this migration) — dropped here as
-- low-risk cleanup alongside the tables it was already dead next to.
DROP TABLE accounts;
--> statement-breakpoint
DROP TABLE verifications;
--> statement-breakpoint
DROP TABLE verification_tokens;
--> statement-breakpoint

-- Secondary lookup key linking a user row to their Logto identity (`sub`),
-- populated lazily via JIT provisioning at first Logto sign-in. users.id
-- stays the authoritative primary key everywhere else in the schema.
ALTER TABLE users ADD COLUMN logto_user_id text UNIQUE;
