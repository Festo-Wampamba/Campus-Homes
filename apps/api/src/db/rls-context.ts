import type { Pool, PoolClient } from 'pg';

import type { UserRole } from '@campushomes/shared';

export interface RlsContext {
  userId: string;
  role: UserRole | 'service_role';
  mfaVerified?: boolean;
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
  let staleConnection: Error | undefined;
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
    await client.query(`SELECT set_config('app.user_id', $1, true), set_config('app.user_role', $2, true), set_config('app.mfa_verified', $3, true)`, [
      ctx.userId,
      ctx.role,
      ctx.mfaVerified === true ? 'true' : 'false',
    ]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    // A named prepared statement whose cached plan no longer matches the
    // schema (a migration changed a selected column's type) fails with 0A000
    // on every later call on this connection. Destroy the connection so the
    // pool opens a fresh one instead of serving that error forever.
    if (pgCode(err) === '0A000') staleConnection = err as Error;
    throw err;
  } finally {
    client.release(staleConnection);
  }
}

// Drizzle wraps pg errors, so the SQLSTATE can sit on err.cause.
function pgCode(err: unknown): string | undefined {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = e?.code ?? e?.cause?.code;
  return typeof code === 'string' ? code : undefined;
}
