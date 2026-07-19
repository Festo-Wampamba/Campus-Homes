/**
 * PermissionsGuard's core logic (loadPermissions, hasCoveringScope) against
 * the real docker test DB — the role/permission seed data from migration
 * 0003 is the fixture, no mocking of the permission catalog.
 */
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import { hasCoveringScope, loadPermissions } from '../../src/modules/auth/permissions';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);

let superAdmin: string;
let plainOpsLead: string;

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  const res = await pool.query(sql, params);
  return res.rows[0]?.id as string;
}

beforeAll(async () => {
  await pool.query(`TRUNCATE users RESTART IDENTITY CASCADE`);

  superAdmin = await seed(
    `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Super Admin') RETURNING id`,
    ['+256700000201'],
  );
  plainOpsLead = await seed(
    `INSERT INTO users (phone, role, status, name) VALUES ($1, 'ops_lead', 'active', 'No Assignment') RETURNING id`,
    ['+256700000202'],
  );

  const superAdminRoleId = await seed(`SELECT id FROM roles WHERE key = 'super_admin'`);
  await pool.query(
    `INSERT INTO user_role_assignments (user_id, role_id, scope_type, assigned_by, reason)
     VALUES ($1, $2, 'platform_wide', $1, 'seed')`,
    [superAdmin, superAdminRoleId],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('loadPermissions', () => {
  it('grants the seeded super_admin permission roles.manage_super_admin', async () => {
    const { permissions } = await loadPermissions(rlsDb, superAdmin);
    expect(permissions.has('roles.manage_super_admin')).toBe(true);
  });

  it('flags refunds.approve as requiring step-up', async () => {
    const { stepUpRequired } = await loadPermissions(rlsDb, superAdmin);
    expect(stepUpRequired.has('refunds.approve')).toBe(true);
  });

  it('returns no permissions for a user with no active assignment', async () => {
    const { permissions } = await loadPermissions(rlsDb, plainOpsLead);
    expect(permissions.size).toBe(0);
  });
});

describe('hasCoveringScope', () => {
  it('a platform_wide assignment covers any catchment target', () => {
    expect(hasCoveringScope([{ scopeType: 'platform_wide', scopeId: null }], 'catchment', 'MUK')).toBe(true);
  });

  it("a catchment assignment scoped 'all' covers a specific catchment target", () => {
    expect(hasCoveringScope([{ scopeType: 'catchment', scopeId: 'all' }], 'catchment', 'MUK')).toBe(true);
  });

  it('a catchment assignment for one catchment does not cover a different catchment', () => {
    expect(hasCoveringScope([{ scopeType: 'catchment', scopeId: 'MUK' }], 'catchment', 'MUBS')).toBe(false);
  });
});
