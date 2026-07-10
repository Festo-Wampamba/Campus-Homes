import { Pool, type PoolClient } from 'pg';

// Local docker test database (docker-compose.test.yml) — not a production secret.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

export const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });

export interface TestIdentity {
  userId?: string;
  role?: string; // undefined = anonymous (no session variables at all)
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
