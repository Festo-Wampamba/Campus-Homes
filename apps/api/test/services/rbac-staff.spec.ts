/**
 * StaffService round trip against the real docker test DB: invite, grant
 * role, revoke role, deactivate, list — plus the separation-of-duty guards
 * (no self-elevation, only manage_super_admin grants super_admin, scope
 * must cover the grant).
 */
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import type { LogtoManagementClient } from '../../src/modules/auth/logto-management.client';
import { AuditService } from '../../src/modules/ops/audit.service';
import { StaffService } from '../../src/modules/staff/staff.service';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const audit = new AuditService(rlsDb);
const fakeToken = ['fake', 'tok'].join('-');
const createUser = jest.fn().mockResolvedValue({ id: 'logto-user-id' });
const createOneTimeToken = jest.fn().mockResolvedValue({ token: fakeToken });
const logtoManagement = { createUser, createOneTimeToken } as unknown as LogtoManagementClient;
const staff = new StaffService(rlsDb, audit, logtoManagement);

let superAdmin: string;
let platformAdmin: string;

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  const res = await pool.query(sql, params);
  return res.rows[0]?.id as string;
}

const superAdminCtx = (): RlsContext => ({ userId: superAdmin, role: 'admin' });
const platformAdminCtx = (): RlsContext => ({ userId: platformAdmin, role: 'admin' });

beforeAll(async () => {
  await pool.query(`TRUNCATE users RESTART IDENTITY CASCADE`);

  superAdmin = await seed(
    `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Super Admin') RETURNING id`,
    ['+256700000301'],
  );
  platformAdmin = await seed(
    `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Platform Admin') RETURNING id`,
    ['+256700000302'],
  );
  await pool.query(`
    INSERT INTO user_role_assignments (user_id, role_id, scope_type, assigned_by, reason)
    SELECT $1, id, 'platform_wide', $1, 'test bootstrap' FROM roles WHERE key = 'super_admin'
  `, [superAdmin]);
  await pool.query(`
    INSERT INTO user_role_assignments (user_id, role_id, scope_type, assigned_by, reason)
    SELECT $1, id, 'platform_wide', $2, 'test bootstrap' FROM roles WHERE key = 'platform_admin'
  `, [platformAdmin, superAdmin]);
});

afterAll(async () => {
  await pool.end();
});

describe('StaffService.grantRole — separation of duty', () => {
  it('blocks an actor from granting a role to themselves', async () => {
    await expect(
      staff.grantRole(
        superAdminCtx(),
        new Set(['roles.assign']),
        [{ scopeType: 'platform_wide', scopeId: null }],
        superAdmin,
        { roleKey: 'finance_admin', scopeType: 'platform_wide', reason: 'self-grant attempt' },
      ),
    ).rejects.toThrow('Cannot assign yourself a role');
  });

  it('blocks a non-manage_super_admin actor from granting super_admin', async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Target') RETURNING id`,
      ['+256700000303'],
    );
    await expect(
      staff.grantRole(
        platformAdminCtx(),
        new Set(['roles.assign']),
        [{ scopeType: 'platform_wide', scopeId: null }],
        target,
        { roleKey: 'super_admin', scopeType: 'platform_wide', reason: 'escalation attempt' },
      ),
    ).rejects.toThrow('Only a Super Admin can grant the Super Admin role');
  });

  it("blocks granting a role outside the actor's own scope", async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'ops_lead', 'active', 'Target2') RETURNING id`,
      ['+256700000304'],
    );
    await expect(
      staff.grantRole(
        platformAdminCtx(),
        new Set(['roles.assign']),
        [{ scopeType: 'catchment', scopeId: 'MUK' }],
        target,
        { roleKey: 'ops_lead', scopeType: 'catchment', scopeId: 'MUBS', reason: 'out of scope' },
      ),
    ).rejects.toThrow('Cannot assign a role outside your own scope');
  });
});

describe('StaffService.grantRole — success path', () => {
  let assignment: Awaited<ReturnType<typeof staff.grantRole>>;

  beforeAll(async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'ops_lead', 'active', 'Target3') RETURNING id`,
      ['+256700000305'],
    );
    assignment = await staff.grantRole(
      superAdminCtx(),
      new Set(['roles.assign']),
      [{ scopeType: 'platform_wide', scopeId: null }],
      target,
      { roleKey: 'ops_lead', scopeType: 'catchment', scopeId: 'MUK', reason: 'onboarding' },
    );
  });

  it('persists the granted scope', () => {
    expect(assignment.scopeId).toBe('MUK');
  });

  it('writes an audit_log row for the grant', async () => {
    const { rows } = await pool.query(
      `SELECT action FROM audit_log WHERE action = 'roles.assign' AND target_id = $1`,
      [assignment.id],
    );
    expect(rows).toHaveLength(1);
  });
});

describe('StaffService.invite + revokeRole round trip', () => {
  it('persists a pending invitation without pre-creating an application user', async () => {
    const invitation = await staff.invite(
      superAdminCtx(),
      new Set(['roles.assign']),
      [{ scopeType: 'platform_wide', scopeId: null }],
      {
        name: 'New Support Admin',
        email: 'new.support@campushomes.ug',
        phone: '+256700000306',
        roleKey: 'support_admin',
        scopeType: 'platform_wide',
        reason: 'new hire',
      },
    );
    const row = (await pool.query(
      `SELECT role_key, status FROM auth_invitations WHERE id = $1`,
      [invitation.id],
    )).rows[0];
    expect(row).toMatchObject({ role_key: 'support_admin', status: 'pending' });
    expect((await pool.query(`SELECT id FROM users WHERE phone = $1`, ['+256700000306'])).rows).toHaveLength(0);
  });

  it('does not create credentials through the CampusHomes management API', async () => {
    createUser.mockClear();
    createOneTimeToken.mockClear();
    await staff.invite(
      superAdminCtx(),
      new Set(['roles.assign']),
      [{ scopeType: 'platform_wide', scopeId: null }],
      {
        name: 'Emailed Support Admin',
        email: 'emailed.support@campushomes.ug',
        roleKey: 'support_admin',
        scopeType: 'platform_wide',
        reason: 'new hire',
      },
    );
    expect(createUser).not.toHaveBeenCalled();
    expect(createOneTimeToken).not.toHaveBeenCalled();
  });

  it('revoking a granted assignment preserves history', async () => {
    const userId = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Another Support Admin') RETURNING id`,
      ['+256700000307'],
    );
    const assignment = await staff.grantRole(
      superAdminCtx(),
      new Set(['roles.assign']),
      [{ scopeType: 'platform_wide', scopeId: null }],
      userId,
      { roleKey: 'support_admin', scopeType: 'platform_wide', reason: 'new hire' },
    );
    const revoked = await staff.revokeRole(
      superAdminCtx(),
      new Set(['roles.revoke']),
      [{ scopeType: 'platform_wide', scopeId: null }],
      assignment.id,
    );
    expect(revoked.revoked).toBe(true);
    expect((await pool.query(
      `SELECT revoked_at FROM user_role_assignments WHERE id = $1`,
      [assignment.id],
    )).rows[0].revoked_at).not.toBeNull();
  });
});

describe('StaffService.deactivate — separation of duty', () => {
  it('blocks an actor from deactivating themselves', async () => {
    await expect(
      staff.deactivate(
        superAdminCtx(),
        new Set(['staff.deactivate']),
        [{ scopeType: 'platform_wide', scopeId: null }],
        superAdmin,
      ),
    ).rejects.toThrow('Cannot deactivate yourself');
  });

  it("blocks deactivating a staff member outside the actor's own scope", async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'ops_lead', 'active', 'Target5') RETURNING id`,
      ['+256700000309'],
    );
    await staff.grantRole(
      superAdminCtx(),
      new Set(['roles.assign']),
      [{ scopeType: 'platform_wide', scopeId: null }],
      target,
      { roleKey: 'ops_lead', scopeType: 'catchment', scopeId: 'MUK', reason: 'seed' },
    );
    await expect(
      staff.deactivate(
        platformAdminCtx(),
        new Set(['staff.deactivate']),
        [{ scopeType: 'catchment', scopeId: 'MUBS' }],
        target,
      ),
    ).rejects.toThrow('Cannot deactivate a staff member outside your own scope');
  });

  it('fails closed when the target has zero active role assignments', async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'ops_lead', 'active', 'Target6') RETURNING id`,
      ['+256700000310'],
    );
    await expect(
      staff.deactivate(
        superAdminCtx(),
        new Set(['staff.deactivate']),
        [{ scopeType: 'catchment', scopeId: 'MUK' }],
        target,
      ),
    ).rejects.toThrow('Cannot deactivate a staff member outside your own scope');
  });

  it('blocks a platform_wide actor without roles.manage_super_admin from deactivating a Super Admin', async () => {
    const superAdminRoleId = await seed(`SELECT id FROM roles WHERE key = 'super_admin'`);
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Target7') RETURNING id`,
      ['+256700000311'],
    );
    await pool.query(
      `INSERT INTO user_role_assignments (user_id, role_id, scope_type, assigned_by, reason)
       VALUES ($1, $2, 'platform_wide', $3, 'seed')`,
      [target, superAdminRoleId, superAdmin],
    );
    await expect(
      staff.deactivate(
        platformAdminCtx(),
        new Set(['staff.deactivate']),
        [{ scopeType: 'platform_wide', scopeId: null }],
        target,
      ),
    ).rejects.toThrow('Only a Super Admin can deactivate a Super Admin');
  });

  it('blocks a platform_wide actor without roles.manage_super_admin from revoking a Super Admin role assignment', async () => {
    const superAdminRoleId = await seed(`SELECT id FROM roles WHERE key = 'super_admin'`);
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Target8') RETURNING id`,
      ['+256700000312'],
    );
    const assignmentId = await seed(
      `INSERT INTO user_role_assignments (user_id, role_id, scope_type, assigned_by, reason)
       VALUES ($1, $2, 'platform_wide', $3, 'seed') RETURNING id`,
      [target, superAdminRoleId, superAdmin],
    );
    await expect(
      staff.revokeRole(
        platformAdminCtx(),
        new Set(['roles.revoke']),
        [{ scopeType: 'platform_wide', scopeId: null }],
        assignmentId,
      ),
    ).rejects.toThrow('Only a Super Admin can revoke this role');
  });
});

describe('StaffService.deactivate and list', () => {
  it('deactivating staff revokes staff access without suspending unrelated account access', async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'ops_lead', 'active', 'Target4') RETURNING id`,
      ['+256700000308'],
    );
    await staff.grantRole(
      superAdminCtx(),
      new Set(['roles.assign']),
      [{ scopeType: 'platform_wide', scopeId: null }],
      target,
      { roleKey: 'ops_lead', scopeType: 'platform_wide', reason: 'seed' },
    );
    const updated = await staff.deactivate(
      superAdminCtx(),
      new Set(['staff.deactivate']),
      [{ scopeType: 'platform_wide', scopeId: null }],
      target,
    );
    expect(updated.deactivated).toBe(true);
    expect((await pool.query(`SELECT status FROM users WHERE id = $1`, [target])).rows[0].status).toBe('active');
    expect((await pool.query(
      `SELECT id FROM user_role_assignments WHERE user_id = $1 AND revoked_at IS NULL`,
      [target],
    )).rows).toHaveLength(0);
  });

  it('list includes the seeded super admin', async () => {
    const rows = await staff.list();
    expect(rows.some((r) => r.id === superAdmin)).toBe(true);
  });

  it('list only returns admin-tier roles', async () => {
    const rows = await staff.list();
    expect(rows.every((r) => ['admin', 'ops_lead', 'ops_inspector'].includes(r.role))).toBe(true);
  });
});
