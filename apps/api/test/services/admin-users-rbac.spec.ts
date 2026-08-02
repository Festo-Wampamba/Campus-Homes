/**
 * AdminUsersService round trip against the real docker test DB: role
 * assignment/revocation and direct permission grant/revocation, plus the
 * separation-of-duty guards this file must match from StaffService (no
 * self-elevation, only manage_super_admin grants/revokes super_admin or its
 * management permission, scope must cover the grant/revoke).
 *
 * AdminUsersService backs /admin/users/* — the endpoint the live Users admin
 * console actually calls — so these checks matter independently of the
 * narrower /admin/staff/* coverage in rbac-staff.spec.ts.
 */
import { Pool } from 'pg';

// better-auth/crypto is ESM-only (.mjs) and Jest's transform isn't configured
// for it; AdminUsersService only calls hashPassword() from create(), which
// this suite doesn't exercise, so a stub avoids pulling in the real ESM file.
jest.mock('better-auth/crypto', () => ({ hashPassword: jest.fn() }));

import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import { loadPermissions } from '../../src/modules/auth/permissions';
import { AuditService } from '../../src/modules/ops/audit.service';
import { AdminUsersService } from '../../src/modules/staff/admin-users.service';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const audit = new AuditService(rlsDb);
const adminUsers = new AdminUsersService(rlsDb, audit);

let superAdmin: string;
let mukAdmin: string;

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  const res = await pool.query(sql, params);
  return res.rows[0]?.id as string;
}

const superAdminCtx = (): RlsContext => ({ userId: superAdmin, role: 'admin' });
const mukAdminCtx = (): RlsContext => ({ userId: mukAdmin, role: 'admin' });
const platformWide = [{ scopeType: 'platform_wide', scopeId: null }];
const catchmentMuk = [{ scopeType: 'catchment', scopeId: 'MUK' }];

beforeAll(async () => {
  await pool.query(`TRUNCATE users RESTART IDENTITY CASCADE`);

  superAdmin = await seed(
    `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Super Admin') RETURNING id`,
    ['+256700001301'],
  );
  mukAdmin = await seed(
    `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'MUK Admin') RETURNING id`,
    ['+256700001302'],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('AdminUsersService.assignRole — separation of duty', () => {
  it('blocks an actor from assigning themselves a role', async () => {
    await expect(
      adminUsers.assignRole(superAdminCtx(), new Set(['roles.assign']), platformWide, superAdmin, {
        roleKey: 'finance_admin',
        scopeType: 'platform_wide',
        reason: 'self-grant attempt',
      }),
    ).rejects.toThrow('Cannot assign yourself a role');
  });

  it('blocks a non-manage_super_admin actor from granting super_admin', async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'pending', 'Target') RETURNING id`,
      ['+256700001303'],
    );
    await expect(
      adminUsers.assignRole(mukAdminCtx(), new Set(['roles.assign']), platformWide, target, {
        roleKey: 'super_admin',
        scopeType: 'platform_wide',
        reason: 'escalation attempt',
      }),
    ).rejects.toThrow('Only a Super Admin can grant the Super Admin role');
  });

  it("blocks assigning a role outside the actor's own scope", async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'ops_lead', 'pending', 'Target2') RETURNING id`,
      ['+256700001304'],
    );
    await expect(
      adminUsers.assignRole(mukAdminCtx(), new Set(['roles.assign']), catchmentMuk, target, {
        roleKey: 'ops_lead',
        scopeType: 'catchment',
        scopeId: 'MUBS',
        reason: 'out of scope',
      }),
    ).rejects.toThrow('Cannot assign a role outside your own scope');
  });

  it('allows assigning a role inside the actor\'s own scope', async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'ops_lead', 'pending', 'Target3') RETURNING id`,
      ['+256700001305'],
    );
    const assignment = await adminUsers.assignRole(mukAdminCtx(), new Set(['roles.assign']), catchmentMuk, target, {
      roleKey: 'ops_lead',
      scopeType: 'catchment',
      scopeId: 'MUK',
      reason: 'onboarding',
    });
    expect(assignment.scopeId).toBe('MUK');
  });
});

describe('AdminUsersService.assignRole/revokeRole — round trip', () => {
  it('a granted role is reflected by loadPermissions and disappears on revoke', async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'ops_lead', 'pending', 'Target4') RETURNING id`,
      ['+256700001306'],
    );
    const assignment = await adminUsers.assignRole(mukAdminCtx(), new Set(['roles.assign']), catchmentMuk, target, {
      roleKey: 'ops_lead',
      scopeType: 'catchment',
      scopeId: 'MUK',
      reason: 'onboarding',
    });

    const granted = await loadPermissions(rlsDb, target);
    expect(granted.permissions.has('visits.read')).toBe(true);

    const { rows } = await pool.query(
      `SELECT action FROM audit_log WHERE action = 'roles.assign' AND target_id = $1`,
      [assignment.id],
    );
    expect(rows).toHaveLength(1);

    const revoked = await adminUsers.revokeRole(mukAdminCtx(), new Set(['roles.revoke']), catchmentMuk, target, assignment.id);
    expect(revoked.revoked).toBe(true);

    const after = await loadPermissions(rlsDb, target);
    expect(after.permissions.has('visits.read')).toBe(false);
  });

  it("blocks revoking a role assignment outside the actor's own scope", async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'ops_lead', 'pending', 'Target5') RETURNING id`,
      ['+256700001307'],
    );
    const assignment = await adminUsers.assignRole(superAdminCtx(), new Set(['roles.assign']), platformWide, target, {
      roleKey: 'ops_lead',
      scopeType: 'catchment',
      scopeId: 'MUBS',
      reason: 'seed',
    });
    await expect(
      adminUsers.revokeRole(mukAdminCtx(), new Set(['roles.revoke']), catchmentMuk, target, assignment.id),
    ).rejects.toThrow('Cannot revoke a role assignment outside your own scope');
  });

  it('blocks a non-manage_super_admin actor from revoking a Super Admin role assignment', async () => {
    const superAdminRoleId = await seed(`SELECT id FROM roles WHERE key = 'super_admin'`);
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Target6') RETURNING id`,
      ['+256700001308'],
    );
    const assignmentId = await seed(
      `INSERT INTO user_role_assignments (user_id, role_id, scope_type, assigned_by, reason)
       VALUES ($1, $2, 'platform_wide', $3, 'seed') RETURNING id`,
      [target, superAdminRoleId, superAdmin],
    );
    await expect(
      adminUsers.revokeRole(mukAdminCtx(), new Set(['roles.revoke']), platformWide, target, assignmentId),
    ).rejects.toThrow('Only a Super Admin can revoke this role');
  });
});

describe('AdminUsersService.grantPermissions — separation of duty', () => {
  it('blocks an actor from granting themselves a direct permission', async () => {
    await expect(
      adminUsers.grantPermissions(mukAdminCtx(), new Set(['users.permissions_manage']), catchmentMuk, mukAdmin, {
        permissionKeys: ['audit.read'],
        scopeType: 'catchment',
        scopeId: 'MUK',
        reason: 'self-grant attempt',
      }),
    ).rejects.toThrow('Cannot grant yourself a permission');
  });

  it("blocks granting a permission outside the actor's own scope", async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Target7') RETURNING id`,
      ['+256700001309'],
    );
    await expect(
      adminUsers.grantPermissions(mukAdminCtx(), new Set(['users.permissions_manage']), catchmentMuk, target, {
        permissionKeys: ['audit.read'],
        scopeType: 'catchment',
        scopeId: 'MUBS',
        reason: 'out of scope',
      }),
    ).rejects.toThrow('Cannot grant a permission outside your own scope');
  });

  it('blocks a non-manage_super_admin actor from granting roles.manage_super_admin', async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Target8') RETURNING id`,
      ['+256700001310'],
    );
    await expect(
      adminUsers.grantPermissions(mukAdminCtx(), new Set(['users.permissions_manage']), catchmentMuk, target, {
        permissionKeys: ['roles.manage_super_admin'],
        scopeType: 'catchment',
        scopeId: 'MUK',
        reason: 'escalation attempt',
      }),
    ).rejects.toThrow('Only a Super Admin can grant Super Admin management');
  });
});

describe('AdminUsersService.grantPermissions/revokePermission — round trip', () => {
  it('a direct grant is reflected by loadPermissions and disappears on revoke', async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Target9') RETURNING id`,
      ['+256700001311'],
    );
    const { grants } = await adminUsers.grantPermissions(mukAdminCtx(), new Set(['users.permissions_manage']), catchmentMuk, target, {
      permissionKeys: ['audit.read'],
      scopeType: 'catchment',
      scopeId: 'MUK',
      reason: 'direct exception',
    });

    const granted = await loadPermissions(rlsDb, target);
    expect(granted.permissions.has('audit.read')).toBe(true);

    const revoked = await adminUsers.revokePermission(
      mukAdminCtx(),
      new Set(['users.permissions_manage']),
      catchmentMuk,
      target,
      grants[0]!.id,
    );
    expect(revoked.revoked).toBe(true);

    const after = await loadPermissions(rlsDb, target);
    expect(after.permissions.has('audit.read')).toBe(false);
  });

  it("blocks revoking a permission grant outside the actor's own scope", async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Target10') RETURNING id`,
      ['+256700001312'],
    );
    const { grants } = await adminUsers.grantPermissions(superAdminCtx(), new Set(['users.permissions_manage']), platformWide, target, {
      permissionKeys: ['audit.read'],
      scopeType: 'catchment',
      scopeId: 'MUBS',
      reason: 'seed',
    });
    await expect(
      adminUsers.revokePermission(mukAdminCtx(), new Set(['users.permissions_manage']), catchmentMuk, target, grants[0]!.id),
    ).rejects.toThrow('Cannot revoke a permission grant outside your own scope');
  });

  it('blocks a non-manage_super_admin actor from revoking a roles.manage_super_admin grant', async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Target11') RETURNING id`,
      ['+256700001313'],
    );
    const { grants } = await adminUsers.grantPermissions(
      superAdminCtx(),
      new Set(['users.permissions_manage', 'roles.manage_super_admin']),
      platformWide,
      target,
      {
        permissionKeys: ['roles.manage_super_admin'],
        scopeType: 'platform_wide',
        reason: 'seed',
      },
    );
    await expect(
      adminUsers.revokePermission(mukAdminCtx(), new Set(['users.permissions_manage']), platformWide, target, grants[0]!.id),
    ).rejects.toThrow('Only a Super Admin can revoke Super Admin management');
  });
});
