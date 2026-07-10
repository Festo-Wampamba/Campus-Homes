import type { Pool, PoolClient } from 'pg';

import type { UserRole } from '@campushomes/shared';

export interface RlsContext {
  userId: string;
  role: UserRole | 'service_role';
}

/**
 * Runs `fn` inside a transaction with the caller's identity bound as Postgres
 * session variables. Every RLS policy reads these via current_setting().
 *
 * SET LOCAL scopes the variables to this transaction only — they can never
 * leak across pooled connections, which is exactly the failure mode that
 * would let one user read another's rows.
 *
 * `service_role` is reserved for server-internal paths (webhooks, jobs) and
 * must never be derived from anything client-supplied.
 */
export async function withRlsContext<T>(
  pool: Pool,
  ctx: RlsContext,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Defense in depth: switch to the restricted app_user role explicitly.
    // In production DATABASE_URL should already connect as an app_user-
    // inheriting role, so this is a no-op there — but if it ever connects as
    // the table owner/superuser (e.g. a misconfigured local/staging URL),
    // Postgres lets owners bypass RLS entirely regardless of the GUCs below.
    // Without this, that misconfiguration fails silently: every query
    // returns every row, no error, no warning.
    await client.query('SET LOCAL ROLE app_user');
    // set_config with parameters — identity values are never string-interpolated.
    await client.query(`SELECT set_config('app.user_id', $1, true), set_config('app.user_role', $2, true)`, [
      ctx.userId,
      ctx.role,
    ]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
