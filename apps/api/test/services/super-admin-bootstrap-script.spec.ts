import { Pool } from 'pg';

import { testDatabaseUrl } from '../test-database-url';

/* eslint-disable @typescript-eslint/no-require-imports */
const { bootstrapSuperAdmin, readBootstrapConfig } = require('../../scripts/bootstrap-logto-super-admin.cjs') as {
  bootstrapSuperAdmin: (pool: Pool, config: Record<string, string | null>) => Promise<Record<string, unknown>>;
  readBootstrapConfig: (env: Record<string, string>) => Record<string, string | null>;
};

const TEST_DATABASE_URL = testDatabaseUrl();
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

  it('turns the self-provisioned student account into staff-only access', async () => {
    const user = (await pool.query(
      `INSERT INTO users (email, role, status, name, email_verified, logto_user_id)
       VALUES ('founder@example.test', 'student', 'active', 'Founder', true, 'logto-founder') RETURNING id`,
    )).rows[0];
    await pool.query(
      `INSERT INTO user_role_assignments (user_id, role_id, scope_type, assigned_by, reason)
       SELECT $1, id, 'own', $1, 'self-provisioned' FROM roles WHERE key = 'student'`,
      [user.id],
    );
    await bootstrapSuperAdmin(pool, readBootstrapConfig({ SUPER_ADMIN_EMAIL: 'founder@example.test' }));
    const state = await pool.query(
      `SELECT u.role::text AS role,
         ARRAY(SELECT r.key FROM user_role_assignments a JOIN roles r ON r.id = a.role_id
               WHERE a.user_id = u.id AND a.revoked_at IS NULL ORDER BY r.key) AS active
       FROM users u WHERE u.id = $1`,
      [user.id],
    );
    expect(state.rows[0]).toEqual({ role: 'admin', active: ['super_admin'] });
  });

  it('refuses to strip landlord access from an account', async () => {
    const user = (await pool.query(
      `INSERT INTO users (email, role, status, name, email_verified, logto_user_id)
       VALUES ('landlord-owner@example.test', 'landlord', 'active', 'Landlord', true, 'logto-landlord-owner') RETURNING id`,
    )).rows[0];
    await pool.query(
      `INSERT INTO user_role_assignments (user_id, role_id, scope_type, assigned_by, reason)
       SELECT $1, id, 'own', $1, 'self-provisioned' FROM roles WHERE key = 'landlord'`,
      [user.id],
    );
    await expect(bootstrapSuperAdmin(pool, readBootstrapConfig({ SUPER_ADMIN_EMAIL: 'landlord-owner@example.test' })))
      .rejects.toThrow('This account has landlord access');
  });
});

