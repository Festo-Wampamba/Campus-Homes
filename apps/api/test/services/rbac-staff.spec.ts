/**
 * StaffService round trip against the real docker test DB: invite, grant
 * role, revoke role, deactivate, list — plus the separation-of-duty guards
 * (no self-elevation, only manage_super_admin grants super_admin, scope
 * must cover the grant).
 */
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import { AuditService } from '../../src/modules/ops/audit.service';
import { StaffService } from '../../src/modules/staff/staff.service';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const audit = new AuditService(rlsDb);
const staff = new StaffService(rlsDb, audit);

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
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'pending', 'Target') RETURNING id`,
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
    ).rejects.toThrow('Only a Super Admin can grant the super_admin role');
  });

  it("blocks granting a role outside the actor's own scope", async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'ops_lead', 'pending', 'Target2') RETURNING id`,
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
    ).rejects.toThrow('Cannot grant a role outside your own scope');
  });
});

describe('StaffService.grantRole — success path', () => {
  let assignment: Awaited<ReturnType<typeof staff.grantRole>>;

  beforeAll(async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'ops_lead', 'pending', 'Target3') RETURNING id`,
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
  it('invites a staff member with the mapped DB role and pending status', async () => {
    const user = await staff.invite(
      superAdminCtx(),
      new Set(['roles.assign']),
      [{ scopeType: 'platform_wide', scopeId: null }],
      {
        name: 'New Support Admin',
        phone: '+256700000306',
        roleKey: 'support_admin',
        scopeType: 'platform_wide',
        reason: 'new hire',
      },
    );
    expect(user.role).toBe('admin');
  });

  it('revoking the granted assignment sets revokedAt', async () => {
    const user = await staff.invite(
      superAdminCtx(),
      new Set(['roles.assign']),
      [{ scopeType: 'platform_wide', scopeId: null }],
      {
        name: 'Another Support Admin',
        phone: '+256700000307',
        roleKey: 'support_admin',
        scopeType: 'platform_wide',
        reason: 'new hire',
      },
    );
    const { rows } = await pool.query(
      `SELECT id FROM user_role_assignments WHERE user_id = $1 AND revoked_at IS NULL`,
      [user.id],
    );
    const revoked = await staff.revokeRole(superAdminCtx(), rows[0].id as string);
    expect(revoked.revokedAt).not.toBeNull();
  });
});

describe('StaffService.deactivate and list', () => {
  it('deactivating a staff member sets status to suspended', async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'ops_lead', 'active', 'Target4') RETURNING id`,
      ['+256700000308'],
    );
    const updated = await staff.deactivate(target);
    expect(updated.status).toBe('suspended');
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
