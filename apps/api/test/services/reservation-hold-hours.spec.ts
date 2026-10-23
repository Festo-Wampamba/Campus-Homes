import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Pool, type PoolClient } from 'pg';

import { testDatabaseUrl } from '../test-database-url';

const TEST_DATABASE_URL = testDatabaseUrl();
const MIGRATION_SQL = readFileSync(join(__dirname, '../../migrations/0061_reservation_hold_24h.sql'), 'utf8');

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 2 });

afterAll(() => pool.end());

async function holdHours(client: PoolClient): Promise<unknown> {
  const res = await client.query(`SELECT value FROM platform_settings WHERE key = 'reservation_hold_hours'`);
  return res.rows[0]?.value;
}

// Other suites wipe tables, so the 0013 seed can't be assumed: stage it here.
// Runs the migration against the staged setting inside a rolled-back transaction,
// so the shared test DB keeps its migrated state.
async function migrateFrom(updatedBy: 'seed' | 'admin'): Promise<unknown> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let adminId: string | null = null;
    if (updatedBy === 'admin') {
      const admin = await client.query<{ id: string }>(
        `INSERT INTO users (phone, role, status, name) VALUES ('+256700006101', 'admin', 'active', 'Settings Admin') RETURNING id`,
      );
      adminId = admin.rows[0]?.id ?? null;
    }
    await client.query(
      `INSERT INTO platform_settings (key, value, description, updated_by)
       VALUES ('reservation_hold_hours', '72'::jsonb, 'Hold hours', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by`,
      [adminId],
    );
    await client.query(MIGRATION_SQL);
    return await holdHours(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

describe('reservation hold hours (migration 0061)', () => {
  it('rewrites the untouched 72h seed to 24', async () => {
    expect(await migrateFrom('seed')).toBe(24);
  });

  it('keeps 72 when an admin saved it in Settings', async () => {
    expect(await migrateFrom('admin')).toBe(72);
  });
});

const MIGRATION_6H_SQL = readFileSync(join(__dirname, '../../migrations/0074_reservation_hold_6h.sql'), 'utf8');

// Same rolled-back staging as migrateFrom(), starting from a given hold length.
async function migrate6hFrom(hours: number): Promise<unknown> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO platform_settings (key, value, description)
       VALUES ('reservation_hold_hours', $1::jsonb, 'Hold hours')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(hours)],
    );
    await client.query(MIGRATION_6H_SQL);
    return await holdHours(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

describe('reservation hold hours (migration 0074)', () => {
  it('shortens a 24h hold to 6', async () => {
    expect(await migrate6hFrom(24)).toBe(6);
  });

  it('keeps any other hold length an admin chose', async () => {
    expect(await migrate6hFrom(12)).toBe(12);
  });
});
