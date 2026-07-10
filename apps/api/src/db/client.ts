import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';

import * as schema from './schema';

export function createDbPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl, max: 10 });
}

// Accepts a PoolClient too so RLS-scoped transactions can wrap a checked-out
// connection in the same drizzle interface.
export function createDb(pool: Pool | PoolClient) {
  return drizzle(pool, { schema });
}

export type Db = ReturnType<typeof createDb>;

/** Unwraps the first row of an INSERT/UPDATE ... RETURNING — those always
 * yield a row when they succeed; an empty result is a programming error. */
export function firstRow<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error('Expected at least one row');
  }
  return row;
}
