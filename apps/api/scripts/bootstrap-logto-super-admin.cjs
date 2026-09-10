const { Pool } = require('pg');

const EMAIL = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();

if (!EMAIL) {
  throw new Error('SUPER_ADMIN_EMAIL is required');
}

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SUPER_ADMIN_BOOTSTRAP !== 'true') {
  throw new Error(
    'Refusing production bootstrap without ALLOW_SUPER_ADMIN_BOOTSTRAP=true',
  );
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // One bootstrap at a time, including separate application containers.
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('campushomes:super-admin-bootstrap', 0))`);

    const users = (
      await client.query(
        `SELECT id, status, deleted_at AS "deletedAt", email_verified AS "emailVerified",
                logto_user_id AS "logtoUserId"
         FROM users
         WHERE lower(btrim(email)) = $1
         FOR UPDATE`,
        [EMAIL],
      )
    ).rows;

    if (users.length === 0) {
      throw new Error(
        'No CampusHomes user has that email. Sign in through Logto once with the verified email, then retry.',
      );
    }
    if (users.length > 1) {
      throw new Error('Multiple CampusHomes users have that email; resolve the identity conflict first');
    }
    const user = users[0];
    if (user.deletedAt || user.status !== 'active') {
      throw new Error('The selected CampusHomes user is not active');
    }
    if (!user.emailVerified || !user.logtoUserId) {
      throw new Error('The selected user must have a linked Logto identity and verified email');
    }

    const role = (await client.query(`SELECT id FROM roles WHERE key = 'super_admin'`)).rows[0];
    if (!role) throw new Error('RBAC migration is not applied: super_admin role missing');

    const existing = (
      await client.query(
        `SELECT id FROM user_role_assignments
         WHERE user_id = $1 AND role_id = $2 AND scope_type = 'platform_wide'
           AND scope_id IS NULL AND revoked_at IS NULL
           AND valid_from <= now() AND (valid_until IS NULL OR valid_until > now())`,
        [user.id, role.id],
      )
    ).rows[0];

    if (!existing) {
      const activeCount = Number(
        (
          await client.query(
            `SELECT count(DISTINCT a.user_id)::int AS count
             FROM user_role_assignments a
             JOIN users u ON u.id = a.user_id
             WHERE a.role_id = $1 AND a.scope_type = 'platform_wide'
               AND a.scope_id IS NULL AND a.revoked_at IS NULL
               AND a.valid_from <= now() AND (a.valid_until IS NULL OR a.valid_until > now())
               AND u.status = 'active' AND u.deleted_at IS NULL`,
            [role.id],
          )
        ).rows[0].count,
      );
      if (activeCount >= 2) {
        throw new Error('Two active Super Admins already exist; use the audited staff console instead');
      }

      const assignment = (
        await client.query(
          `INSERT INTO user_role_assignments
             (user_id, role_id, scope_type, assigned_by, reason)
           VALUES ($1, $2, 'platform_wide', $1, 'Initial Logto Super Admin bootstrap')
           RETURNING id`,
          [user.id, role.id],
        )
      ).rows[0];
      await client.query(
        `INSERT INTO audit_log
           (actor_id, actor_role, action, target_type, target_id, payload)
         VALUES ($1, 'service_role', 'roles.bootstrap_super_admin',
                 'user_role_assignment', $2, $3::jsonb)`,
        [user.id, assignment.id, JSON.stringify({ targetUserId: user.id })],
      );
    }

    await client.query('COMMIT');
    console.log(JSON.stringify({ ok: true, email: EMAIL, alreadyAssigned: Boolean(existing) }));
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
