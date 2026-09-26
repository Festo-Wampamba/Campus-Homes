import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';

import * as schema from './schema';

export function createDbPool(databaseUrl: string): Pool {
  // jit=off: every RLS-policied table expands into hundreds of nested policy
  // subplans, pushing planner cost past jit_above_cost, so Postgres LLVM-
  // compiles ~1,500 functions per query — ~1-2s even on an empty table,
  // vs ~10ms without JIT. This OLTP workload never benefits from JIT.
  return new Pool({ connectionString: databaseUrl, max: 10, options: '-c jit=off' });
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
