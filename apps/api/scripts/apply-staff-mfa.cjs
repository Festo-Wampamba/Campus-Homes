// One-off per environment: makes 2-step verification mandatory for staff and
// never prompted for anyone else (students, landlords).
//   1. Tenant MFA policy -> 'NoPrompt' (nobody is asked by default) and
//      organizationRequiredMfaPolicy -> 'Mandatory'.
//   2. The "CampusHomes Staff" organization (isMfaRequired) exists, and every
//      current staff member with a Logto identity is a member, so Logto makes
//      them set up an authenticator at their next sign-in, with no Skip.
// New staff join the organization automatically on staff sign-in (auth callback).
//
//   local:      pnpm --filter @campushomes/api build && pnpm --filter @campushomes/api auth:staff-mfa
//   production: docker exec <api container> node scripts/apply-staff-mfa.cjs
// Safe to re-run.
const { Pool } = require('pg');

const { loadEnv } = require('../dist/src/config/env');
const { LogtoManagementClient } = require('../dist/src/modules/auth/logto-management.client');

const STAFF_ROLE_KEYS = ['super_admin', 'platform_admin', 'ops_lead', 'ops_inspector', 'finance_admin', 'support_admin', 'auditor'];

async function staffLogtoIds(env) {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.user_role', 'service_role', true)`);
    const { rows } = await client.query(
      `SELECT DISTINCT u.logto_user_id AS id
       FROM user_role_assignments a
       JOIN roles r ON r.id = a.role_id
       JOIN users u ON u.id = a.user_id
       WHERE r.key = ANY($1) AND a.revoked_at IS NULL AND a.valid_from <= now()
         AND (a.valid_until IS NULL OR a.valid_until > now())
         AND u.logto_user_id IS NOT NULL AND u.deleted_at IS NULL`,
      [STAFF_ROLE_KEYS],
    );
    await client.query('COMMIT');
    return rows.map((row) => row.id);
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const env = loadEnv();
  const logto = new LogtoManagementClient(env);

  const { mfa } = await logto.getSignInExperience();
  const factors = Array.from(new Set([...(mfa?.factors ?? []), 'Totp', 'BackupCode']));
  await logto.updateSignInExperience({ mfa: { factors, policy: 'NoPrompt', organizationRequiredMfaPolicy: 'Mandatory' } });
  console.log(`MFA policy set: NoPrompt for everyone, Mandatory for staff organization members (factors: ${factors.join(', ')}).`);

  const ids = await staffLogtoIds(env);
  let failed = 0;
  for (const id of ids) {
    try {
      await logto.addToStaffMfaOrganization(id);
    } catch (err) {
      failed += 1;
      console.error(`Failed to add ${id}: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`Staff organization: ${ids.length - failed} of ${ids.length} staff member(s) added.`);

  // Former staff (revoked or expired roles) must not keep mandatory MFA.
  const staff = new Set(ids);
  const members = await logto.listStaffMfaOrganizationMembers();
  const former = members.filter((id) => !staff.has(id));
  for (const id of former) {
    try {
      await logto.removeFromStaffMfaOrganization(id);
    } catch (err) {
      failed += 1;
      console.error(`Failed to remove ${id}: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`Removed ${former.length} former staff member(s) from the organization.`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
