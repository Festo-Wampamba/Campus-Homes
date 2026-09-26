/**
 * The app pool must run with JIT disabled: nested RLS policies inflate planner
 * cost past jit_above_cost, and JIT compilation alone cost ~1-2s per query on
 * empty tables (admin Overview took 5-47s on production before this).
 */
import { createDbPool } from '../../src/db/client';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

const pool = createDbPool(TEST_DATABASE_URL);

afterAll(() => pool.end());

it('app pool connections run with jit disabled', async () => {
  const { rows } = await pool.query<{ jit: string }>('SHOW jit');

  expect(rows[0]?.jit).toBe('off');
});
