const { Pool } = require('pg');

const OPS_ROLES = new Set(['ops_lead', 'ops_inspector']);
const CATCHMENTS = new Set(['MUK', 'MUBS', 'KIU', 'KYU', 'all']);

function readBootstrapConfig(env) {
  const email = env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error('SUPER_ADMIN_EMAIL is required');
  if (env.NODE_ENV === 'production' && env.ALLOW_SUPER_ADMIN_BOOTSTRAP !== 'true') {
    throw new Error('Refusing production bootstrap without ALLOW_SUPER_ADMIN_BOOTSTRAP=true');
  }

  const opsRole = env.SUPER_ADMIN_OPS_ROLE?.trim() || null;
  if (opsRole && !OPS_ROLES.has(opsRole)) {
    throw new Error('SUPER_ADMIN_OPS_ROLE must be ops_lead or ops_inspector');
  }
  const opsScopeType = opsRole ? env.SUPER_ADMIN_OPS_SCOPE_TYPE?.trim() : null;
  if (opsRole && !['platform_wide', 'catchment'].includes(opsScopeType)) {
    throw new Error('SUPER_ADMIN_OPS_SCOPE_TYPE must be platform_wide or catchment when SUPER_ADMIN_OPS_ROLE is set');
  }
  const opsScopeId = opsScopeType === 'catchment' ? env.SUPER_ADMIN_OPS_SCOPE_ID?.trim() : null;
  if (opsScopeType === 'catchment' && (!opsScopeId || !CATCHMENTS.has(opsScopeId))) {
    throw new Error('SUPER_ADMIN_OPS_SCOPE_ID must be MUK, MUBS, KIU, KYU, or all for a catchment grant');
  }
  if (opsScopeType === 'platform_wide' && env.SUPER_ADMIN_OPS_SCOPE_ID?.trim()) {
    throw new Error('SUPER_ADMIN_OPS_SCOPE_ID must be empty for a platform-wide grant');
  }
  return { email, opsRole, opsScopeType, opsScopeId };
}

async function insertAudit(client, userId, action, assignmentId, payload) {
  await client.query(
    `INSERT INTO audit_log
       (actor_id, actor_role, action, target_type, target_id, payload)
     VALUES ($1, 'service_role', $2, 'user_role_assignment', $3, $4::jsonb)`,
    [userId, action, assignmentId, JSON.stringify(payload)],
  );
}

async function bootstrapSuperAdmin(pool, config) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // This command runs outside Nest's RlsDb wrapper, so it must establish
    // the same transaction-local service context before reading or writing
    // protected tables. Without it, PostgreSQL RLS makes an existing user
    // appear absent and the bootstrap fails closed with a misleading error.
    await client.query('SET LOCAL ROLE app_user');
    await client.query(
      "SELECT set_config('app.user_id', $1, true), set_config('app.user_role', 'service_role', true), set_config('app.mfa_verified', 'true', true)",
      ['00000000-0000-0000-0000-000000000000'],
    );
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('campushomes:super-admin-bootstrap', 0))`);

    const users = (
      await client.query(
        `SELECT id, status, deleted_at AS "deletedAt", email_verified AS "emailVerified",
                logto_user_id AS "logtoUserId"
         FROM users
         WHERE lower(btrim(email)) = $1
         FOR UPDATE`,
        [config.email],
      )
    ).rows;

    if (users.length === 0) {
      throw new Error('No CampusHomes user has that email. Sign in through Logto once with the verified email, then retry.');
    }
    if (users.length > 1) {
      throw new Error('Multiple CampusHomes users have that email; resolve the identity conflict first');
    }
    const user = users[0];
    if (user.deletedAt || user.status !== 'active') throw new Error('The selected CampusHomes user is not active');
    if (!user.emailVerified || !user.logtoUserId) {
      throw new Error('The selected user must have a linked Logto identity and verified email');
    }

    const superAdminRole = (await client.query(`SELECT id FROM roles WHERE key = 'super_admin'`)).rows[0];
    if (!superAdminRole) throw new Error('RBAC migration is not applied: super_admin role missing');
    const existingSuperAdmin = (
      await client.query(
        `SELECT id FROM user_role_assignments
         WHERE user_id = $1 AND role_id = $2 AND scope_type = 'platform_wide'
           AND scope_id IS NULL AND revoked_at IS NULL
           AND valid_from <= now() AND (valid_until IS NULL OR valid_until > now())`,
        [user.id, superAdminRole.id],
      )
    ).rows[0];

    if (!existingSuperAdmin) {
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
            [superAdminRole.id],
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
          [user.id, superAdminRole.id],
        )
      ).rows[0];
      await insertAudit(client, user.id, 'roles.bootstrap_super_admin', assignment.id, { targetUserId: user.id });
    }

    let existingOps = null;
    if (config.opsRole) {
      const opsRole = (await client.query('SELECT id FROM roles WHERE key = $1', [config.opsRole])).rows[0];
      if (!opsRole) throw new Error(`RBAC migration is not applied: ${config.opsRole} role missing`);
      existingOps = (
        await client.query(
          `SELECT id FROM user_role_assignments
           WHERE user_id = $1 AND role_id = $2 AND scope_type = $3
             AND scope_id IS NOT DISTINCT FROM $4 AND revoked_at IS NULL
             AND valid_from <= now() AND (valid_until IS NULL OR valid_until > now())`,
          [user.id, opsRole.id, config.opsScopeType, config.opsScopeId],
        )
      ).rows[0];
      if (!existingOps) {
        const assignment = (
          await client.query(
            `INSERT INTO user_role_assignments
               (user_id, role_id, scope_type, scope_id, assigned_by, reason)
             VALUES ($1, $2, $3, $4, $1, 'Initial Operations access granted during guarded bootstrap')
             RETURNING id`,
            [user.id, opsRole.id, config.opsScopeType, config.opsScopeId],
          )
        ).rows[0];
        await insertAudit(client, user.id, 'roles.bootstrap_ops_access', assignment.id, {
          targetUserId: user.id,
          roleKey: config.opsRole,
          scopeType: config.opsScopeType,
          scopeId: config.opsScopeId,
        });
      }
      await client.query(
        `INSERT INTO ops_staff (user_id, team, assigned_catchment, active)
         VALUES ($1, $2::ops_team, $3::catchment, true)
         ON CONFLICT (user_id) DO UPDATE SET
           team = EXCLUDED.team, assigned_catchment = EXCLUDED.assigned_catchment, active = true`,
        [
          user.id,
          config.opsRole === 'ops_lead' ? 'lead' : 'inspector',
          config.opsScopeType === 'catchment' ? config.opsScopeId : 'all',
        ],
      );
    }

    await client.query('COMMIT');
    return {
      ok: true,
      email: config.email,
      alreadyAssigned: Boolean(existingSuperAdmin),
      opsRole: config.opsRole,
      opsAlreadyAssigned: config.opsRole ? Boolean(existingOps) : null,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function run() {
  const config = readBootstrapConfig(process.env);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  try {
    console.log(JSON.stringify(await bootstrapSuperAdmin(pool, config)));
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

module.exports = { bootstrapSuperAdmin, readBootstrapConfig };
