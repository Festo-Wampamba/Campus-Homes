// One-off: copies every linked user's details (name, gender, date of birth,
// address, contact phone, nationality, emergency contact, account type) into
// Logto, so the Logto console shows the full person. New saves already sync
// on their own (LogtoProfileSync); this only catches up existing accounts.
//
// Uses the compiled mapping in dist/, so it can never drift from the API:
//   local:      pnpm --filter @campushomes/api build && pnpm --filter @campushomes/api logto:backfill-profiles
//   production: docker exec <api container> node scripts/backfill-logto-profiles.cjs
// Safe to re-run: Logto profile/custom-data updates are partial and idempotent.
const { Pool } = require('pg');

const { loadEnv } = require('../dist/src/config/env');
const { LogtoManagementClient } = require('../dist/src/modules/auth/logto-management.client');
const { syncAllLogtoProfiles } = require('../dist/src/modules/auth/logto-profile-sync');

async function main() {
  const env = loadEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // users is RLS-forced; the API's own service paths read it the same way.
    await client.query(`SELECT set_config('app.user_role', 'service_role', true)`);
    const { synced, failed } = await syncAllLogtoProfiles(client, new LogtoManagementClient(env));
    await client.query('COMMIT');
    console.log(`Synced ${synced} user(s) to Logto.`);
    for (const f of failed) console.error(`Failed ${f.logtoUserId}: ${f.error}`);
    if (failed.length) process.exitCode = 1;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
