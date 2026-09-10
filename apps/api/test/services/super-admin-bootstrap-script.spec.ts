import { Pool } from 'pg';

/* eslint-disable @typescript-eslint/no-require-imports */
const { bootstrapSuperAdmin, readBootstrapConfig } = require('../../scripts/bootstrap-logto-super-admin.cjs') as {
  bootstrapSuperAdmin: (pool: Pool, config: Record<string, string | null>) => Promise<Record<string, unknown>>;
  readBootstrapConfig: (env: Record<string, string>) => Record<string, string | null>;
};

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';
const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 3 });

beforeAll(async () => {
  await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');
  await pool.query(
    `INSERT INTO users (email, role, status, name, email_verified, logto_user_id)
     VALUES ('owner@example.test', 'admin', 'active', 'Owner', true, 'logto-owner')`,
  );
});

afterAll(async () => pool.end());

describe('guarded Super Admin bootstrap', () => {
  it('requires explicit, internally consistent Operations scope configuration', () => {
    expect(() => readBootstrapConfig({
      SUPER_ADMIN_EMAIL: 'owner@example.test',
      SUPER_ADMIN_OPS_ROLE: 'ops_lead',
    })).toThrow('SUPER_ADMIN_OPS_SCOPE_TYPE');
    expect(() => readBootstrapConfig({
      SUPER_ADMIN_EMAIL: 'owner@example.test',
      SUPER_ADMIN_OPS_ROLE: 'ops_inspector',
      SUPER_ADMIN_OPS_SCOPE_TYPE: 'catchment',
      SUPER_ADMIN_OPS_SCOPE_ID: 'unknown',
    })).toThrow('SUPER_ADMIN_OPS_SCOPE_ID');
  });

  it('requires the production bootstrap latch', () => {
    expect(() => readBootstrapConfig({
      NODE_ENV: 'production',
      SUPER_ADMIN_EMAIL: 'owner@example.test',
    })).toThrow('ALLOW_SUPER_ADMIN_BOOTSTRAP=true');
  });

  it('idempotently grants Super Admin and initial Operations access with audit records', async () => {
    const config = readBootstrapConfig({
      SUPER_ADMIN_EMAIL: 'OWNER@example.test',
      SUPER_ADMIN_OPS_ROLE: 'ops_lead',
      SUPER_ADMIN_OPS_SCOPE_TYPE: 'platform_wide',
    });
    await expect(bootstrapSuperAdmin(pool, config)).resolves.toEqual(expect.objectContaining({
      alreadyAssigned: false,
      opsAlreadyAssigned: false,
      opsRole: 'ops_lead',
    }));
    await expect(bootstrapSuperAdmin(pool, config)).resolves.toEqual(expect.objectContaining({
      alreadyAssigned: true,
      opsAlreadyAssigned: true,
    }));

    const assignments = await pool.query(
      `SELECT r.key, a.scope_type AS "scopeType", a.scope_id AS "scopeId"
       FROM user_role_assignments a JOIN roles r ON r.id = a.role_id
       ORDER BY r.key`,
    );
    expect(assignments.rows).toEqual([
      { key: 'ops_lead', scopeType: 'platform_wide', scopeId: null },
      { key: 'super_admin', scopeType: 'platform_wide', scopeId: null },
    ]);
    expect((await pool.query('SELECT team, assigned_catchment AS "assignedCatchment", active FROM ops_staff')).rows)
      .toEqual([{ team: 'lead', assignedCatchment: 'all', active: true }]);
    expect((await pool.query(`SELECT action FROM audit_log ORDER BY action`)).rows).toEqual([
      { action: 'roles.bootstrap_ops_access' },
      { action: 'roles.bootstrap_super_admin' },
    ]);
  });
});
