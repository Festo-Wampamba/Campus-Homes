/**
 * A named prepared statement (listings search) outlives a migration on its
 * pooled connection. When the migration changes a selected column's type,
 * Postgres rejects every later call with 0A000 "cached plan must not change
 * result type". withRlsContext must drop that connection so the next request
 * gets a fresh one, instead of the error repeating until a restart.
 */
import { Pool } from 'pg';

import { withRlsContext, type RlsContext } from '../../src/db/rls-context';
import { testDatabaseUrl } from '../test-database-url';

const SERVICE_CTX: RlsContext = { userId: '00000000-0000-0000-0000-000000000000', role: 'service_role' };

// One connection, so every call reuses the connection that holds the statement.
const pool = new Pool({ connectionString: testDatabaseUrl(), max: 1 });
const owner = new Pool({ connectionString: testDatabaseUrl(), max: 1 });

const probe = () => withRlsContext(pool, SERVICE_CTX, (client) =>
  client.query({ name: 'stale_plan_probe', text: 'SELECT x FROM stale_plan_probe' }));

beforeAll(async () => {
  await owner.query('DROP TABLE IF EXISTS stale_plan_probe');
  await owner.query('CREATE TABLE stale_plan_probe (x int)');
  await owner.query('INSERT INTO stale_plan_probe VALUES (1)');
  await owner.query('GRANT SELECT ON stale_plan_probe TO app_user');
});

afterAll(async () => {
  await owner.query('DROP TABLE IF EXISTS stale_plan_probe');
  await Promise.all([pool.end(), owner.end()]);
});

it('fails once on a stale prepared statement, then recovers on a fresh connection', async () => {
  await probe();
  await owner.query('ALTER TABLE stale_plan_probe ALTER COLUMN x TYPE bigint');

  const staleError = await probe().then(() => null, (err: { code?: string }) => err.code);
  const recovered = await probe();

  expect([staleError, recovered.rows.length]).toEqual(['0A000', 1]);
});
