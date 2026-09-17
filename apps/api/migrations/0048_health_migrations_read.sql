-- /health probes drizzle.__drizzle_migrations to report the applied-migration
-- count and expose schema drift, but the runtime role (app_user) was never
-- granted read on the drizzle schema — so both reads threw permission-denied,
-- were caught, and surfaced as null, indistinguishable from "never migrated".
-- Grant read-only access to the single ledger table so /health reports the real
-- state (applied count + ledgerPresent). No RLS on this drizzle-owned table.
GRANT USAGE ON SCHEMA drizzle TO app_user;
--> statement-breakpoint
GRANT SELECT ON drizzle.__drizzle_migrations TO app_user;
