const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { hashPassword } = require('better-auth/crypto');

const EMAIL = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
const PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

if (!EMAIL) {
  throw new Error('SUPER_ADMIN_EMAIL is required');
}
if (!PASSWORD || PASSWORD.length < 16) {
  throw new Error('SUPER_ADMIN_PASSWORD is required and must be at least 16 characters');
}

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_ADMIN_RESET !== 'true') {
  throw new Error('Refusing to reset production administrators without ALLOW_ADMIN_RESET=true');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const role = await client.query(`SELECT id FROM roles WHERE key = 'super_admin'`);
    if (!role.rows[0]) throw new Error('RBAC migration is not applied: super_admin role missing');

    let owner = await client.query(`SELECT id FROM users WHERE lower(email) = lower($1)`, [EMAIL]);
    if (!owner.rows[0]) {
      owner = await client.query(
        `INSERT INTO users (email, role, status, name, email_verified)
         VALUES ($1, 'admin', 'active', 'Festo', true) RETURNING id`,
        [EMAIL],
      );
    }
    const ownerId = owner.rows[0].id;

    const oldAdmins = await client.query(
      `SELECT id FROM users WHERE role = 'admin' AND id <> $1`,
      [ownerId],
    );
    const oldIds = oldAdmins.rows.map((row) => row.id);
    if (oldIds.length > 0) {
      await client.query(`DELETE FROM sessions WHERE user_id = ANY($1::uuid[])`, [oldIds]);
      await client.query(`DELETE FROM accounts WHERE user_id = ANY($1::uuid[])`, [oldIds]);
      await client.query(
        `UPDATE user_role_assignments
         SET revoked_at = coalesce(revoked_at, now()), revoked_by = coalesce(revoked_by, $1)
         WHERE user_id = ANY($2::uuid[]) AND revoked_at IS NULL`,
        [ownerId, oldIds],
      );
      await client.query(`UPDATE users SET status = 'suspended', updated_at = now() WHERE id = ANY($1::uuid[])`, [oldIds]);
    }

    await client.query(
      `UPDATE users SET email = $1, role = 'admin', status = 'active', name = 'Festo',
         email_verified = true, updated_at = now() WHERE id = $2`,
      [EMAIL, ownerId],
    );
    await client.query(`DELETE FROM sessions WHERE user_id = $1`, [ownerId]);
    await client.query(`DELETE FROM accounts WHERE user_id = $1`, [ownerId]);
    await client.query(
      `UPDATE user_role_assignments SET revoked_at = now(), revoked_by = $1
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [ownerId],
    );

    const passwordHash = await hashPassword(PASSWORD);
    await client.query(
      `INSERT INTO accounts (id, account_id, provider_id, user_id, password)
       VALUES ($1, $2, 'credential', $3, $4)`,
      [randomUUID(), ownerId, ownerId, passwordHash],
    );
    await client.query(
      `INSERT INTO user_role_assignments (user_id, role_id, scope_type, assigned_by, reason)
       VALUES ($1, $2, 'platform_wide', $1, 'Super-admin ownership reset')`,
      [ownerId, role.rows[0].id],
    );
    await client.query('COMMIT');
    console.log(JSON.stringify({ ok: true, email: EMAIL, suspendedPreviousAdmins: oldIds.length }));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
