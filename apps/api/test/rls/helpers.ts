import { Pool, type PoolClient } from 'pg';

// Local docker test database (docker-compose.test.yml) — not a production secret.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

export const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });

export interface TestIdentity {
  userId?: string;
  role?: string; // undefined = anonymous (no session variables at all)
  mfaVerified?: boolean;
}

/**
 * Runs `fn` exactly the way the API runtime does: as the non-owner `app_user`
 * role with the caller's identity in session variables, inside a transaction
 * that is always rolled back so tests never leak state.
 */
export async function asIdentity<T>(
  identity: TestIdentity,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE app_user');
    if (identity.userId) {
      await client.query(`SELECT set_config('app.user_id', $1, true)`, [identity.userId]);
    }
    if (identity.role) {
      await client.query(`SELECT set_config('app.user_role', $1, true)`, [identity.role]);
      // app_staff_scope() (0035) requires provider-verified MFA before it grants
      // any staff RLS access — these tests exercise row visibility, not MFA
      // enforcement itself (that's covered separately), so assume it's present.
      await client.query(`SELECT set_config('app.mfa_verified', $1, true)`, [
        identity.mfaVerified === false ? 'false' : 'true',
      ]);
    }
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

/** Seeds run as the superuser owner — RLS does not apply, triggers still do. */
export async function seed(sql: string, params: unknown[] = []): Promise<string> {
  const res = await pool.query(sql, params);
  return res.rows[0]?.id ?? res.rows[0]?.user_id;
}

/** app_staff_scope() (0035) reads real user_role_assignments rows, not
 * users.role — a staff test identity needs one of these platform-wide,
 * active grants or every app_is_ops()/app_is_lead() check denies it. */
export async function grantPlatformRole(userId: string, roleKey: string): Promise<void> {
  await pool.query(
    `INSERT INTO user_role_assignments (user_id, role_id, scope_type, scope_id, assigned_by, reason)
     SELECT $1, id, 'platform_wide', NULL, $1, 'test fixture'
     FROM roles WHERE key = $2`,
    [userId, roleKey],
  );
}
