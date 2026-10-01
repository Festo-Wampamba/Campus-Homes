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

import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import type { LogtoManagementClient } from '../../src/modules/auth/logto-management.client';
import { loadPermissions } from '../../src/modules/auth/permissions';
import { AuditService } from '../../src/modules/ops/audit.service';
import { AdminUsersService } from '../../src/modules/staff/admin-users.service';
import { testDatabaseUrl } from '../test-database-url';

const TEST_DATABASE_URL = testDatabaseUrl();

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const audit = new AuditService(rlsDb);
// This suite exercises role assignment/revocation only, never create() with
// a temporaryPassword — the Management API client is never actually called.
const logtoManagement = {} as LogtoManagementClient;
const adminUsers = new AdminUsersService(rlsDb, audit, logtoManagement);

let superAdmin: string;
let mukAdmin: string;

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  const res = await pool.query(sql, params);
  return res.rows[0]?.id as string;
}

async function assign(userId: string, roleKey: string, scopeType = 'platform_wide', scopeId: string | null = null) {
  await pool.query(`
    INSERT INTO user_role_assignments (user_id, role_id, scope_type, scope_id, assigned_by, reason)
    SELECT $1, id, $2, $3, $1, 'seed' FROM roles WHERE key = $4
  `, [userId, scopeType, scopeId, roleKey]);
}

const superAdminCtx = (): RlsContext => ({ userId: superAdmin, role: 'admin' });
const mukAdminCtx = (): RlsContext => ({ userId: mukAdmin, role: 'admin' });
const platformWide = [{ scopeType: 'platform_wide', scopeId: null }];
const superPerms = new Set(['users.update', 'roles.manage_super_admin']);
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
  await assign(superAdmin, 'super_admin');
  // The grantor must actually hold what it grants; mukAdmin holds audit.read
  // only inside the MUK catchment.
  await pool.query(`
    INSERT INTO user_permission_grants (user_id, permission_id, scope_type, scope_id, granted_by, reason)
    SELECT $1, id, 'catchment', 'MUK', $2, 'seed' FROM permissions WHERE key = 'audit.read'
  `, [mukAdmin, superAdmin]);
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
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Target') RETURNING id`,
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
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'ops_lead', 'active', 'Target2') RETURNING id`,
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
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'ops_lead', 'active', 'Target3') RETURNING id`,
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

describe('AdminUsersService identity boundaries', () => {
  it('rejects direct staff creation outside the invitation workflow', async () => {
    await expect(adminUsers.create(superAdminCtx(), {
      name: 'Direct Staff',
      email: 'direct.staff@example.com',
      accountType: 'ops_inspector',
      status: 'active',
    })).rejects.toThrow('Staff accounts must be created through the audited invitation workflow');
  });

  it('never creates a Logto credential or infers contact verification', async () => {
    const created = await adminUsers.create(superAdminCtx(), {
      name: 'Administrative Student Record',
      email: 'admin-created-student@example.com',
      accountType: 'student',
      status: 'active',
      university: 'MUK',
      yearOfStudy: 2,
    });
    expect((await pool.query(`
      SELECT email_verified, phone_verified, logto_user_id FROM users WHERE id = $1
    `, [created.id])).rows[0]).toEqual({
      email_verified: false,
      phone_verified: false,
      logto_user_id: null,
    });
  });

  it('rejects compatibility account-type edits in favor of scoped assignments', async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'student', 'active', 'Profile Type Target') RETURNING id`,
      ['+256700001315'],
    );
    await expect(adminUsers.update(superAdminCtx(), superPerms, platformWide, target, { accountType: 'landlord' }))
      .rejects.toThrow('Use role assignments to change access');
  });
});

describe('AdminUsersService role assignment — ops staff directory', () => {
  it('adds an assigned inspector to the directory without rewriting their consumer profile type', async () => {
    const registeredUser = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'student', 'active', 'Registered inspector') RETURNING id`,
      ['+256700001314'],
    );

    await adminUsers.assignRole(
      superAdminCtx(),
      new Set(['roles.assign']),
      platformWide,
      registeredUser,
      { roleKey: 'ops_inspector', scopeType: 'platform_wide', reason: 'approved staff transfer' },
    );

    const { rows } = await pool.query(
      `SELECT team::text AS team, active FROM ops_staff WHERE user_id = $1`,
      [registeredUser],
    );
    expect(rows).toEqual([{ team: 'inspector', active: true }]);
    expect((await pool.query(`SELECT role::text FROM users WHERE id = $1`, [registeredUser])).rows[0].role).toBe('student');
  });
});

describe('AdminUsersService.assignRole/revokeRole — round trip', () => {
  it('a granted role is reflected by loadPermissions and disappears on revoke', async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'ops_lead', 'active', 'Target4') RETURNING id`,
      ['+256700001306'],
    );
    const assignment = await adminUsers.assignRole(mukAdminCtx(), new Set(['roles.assign']), catchmentMuk, target, {
      roleKey: 'ops_lead',
      scopeType: 'catchment',
      scopeId: 'MUK',
      reason: 'onboarding',
    });

    const granted = await loadPermissions(rlsDb, target, 'visits.read');
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
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'ops_lead', 'active', 'Target5') RETURNING id`,
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

    const granted = await loadPermissions(rlsDb, target, 'audit.read');
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

describe('AdminUsersService.grantPermissions — grantor must hold what it grants', () => {
  const grantInput = (permissionKeys: string[], scopeType: 'platform_wide' | 'catchment' = 'catchment') => ({
    permissionKeys,
    scopeType,
    scopeId: scopeType === 'catchment' ? 'MUK' : undefined,
    reason: 'escalation attempt',
  });

  it('refuses a permission the grantor does not hold', async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Grant Target A') RETURNING id`,
      ['+256700001401'],
    );
    await expect(
      adminUsers.grantPermissions(mukAdminCtx(), new Set(['users.permissions_manage']), catchmentMuk, target,
        grantInput(['roles.assign'])),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('allows a permission the grantor holds at a covering scope', async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Grant Target B') RETURNING id`,
      ['+256700001402'],
    );
    const { grants } = await adminUsers.grantPermissions(
      superAdminCtx(), new Set(['users.permissions_manage']), platformWide, target, grantInput(['roles.assign'], 'platform_wide'));
    expect(grants.map((g) => g.permissionKey)).toEqual(['roles.assign']);
  });

  it('refuses a platform-wide grant of a key the grantor holds only in one catchment', async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Grant Target C') RETURNING id`,
      ['+256700001403'],
    );
    await expect(
      adminUsers.grantPermissions(mukAdminCtx(), new Set(['users.permissions_manage']), platformWide, target,
        grantInput(['audit.read'], 'platform_wide')),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('AdminUsersService.update / revokeSessions — staff target guards', () => {
  let platformAdmin: string;
  let targetSuper: string;
  let targetOps: string;
  const platformAdminCtx = (): RlsContext => ({ userId: platformAdmin, role: 'admin' });
  const adminPerms = new Set(['users.update']);

  beforeAll(async () => {
    platformAdmin = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Platform Admin') RETURNING id`,
      ['+256700001410'],
    );
    await assign(platformAdmin, 'platform_admin');
    targetSuper = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Target Super') RETURNING id`,
      ['+256700001411'],
    );
    await assign(targetSuper, 'super_admin');
    targetOps = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'ops_lead', 'active', 'Target Ops') RETURNING id`,
      ['+256700001412'],
    );
    await assign(targetOps, 'ops_lead');
  });

  it('refuses suspending a super_admin without roles.manage_super_admin', async () => {
    await expect(
      adminUsers.update(platformAdminCtx(), adminPerms, platformWide, targetSuper, { status: 'suspended' }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('lets a super_admin actor suspend another super_admin', async () => {
    const updated = await adminUsers.update(superAdminCtx(), superPerms, platformWide, targetSuper, { status: 'suspended' });
    expect(updated?.status).toBe('suspended');
    await pool.query(`UPDATE users SET status = 'active' WHERE id = $1`, [targetSuper]);
  });

  it('refuses revoking the sessions of a super_admin without roles.manage_super_admin', async () => {
    await expect(
      adminUsers.revokeSessions(platformAdminCtx(), adminPerms, platformWide, targetSuper),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('lets a super_admin actor revoke the sessions of another super_admin', async () => {
    await expect(adminUsers.revokeSessions(superAdminCtx(), superPerms, platformWide, targetSuper))
      .resolves.toEqual({ revoked: 0 });
  });

  it('lets an actor revoke their own sessions', async () => {
    await expect(adminUsers.revokeSessions(superAdminCtx(), new Set(['users.update']), platformWide, superAdmin))
      .resolves.toEqual({ revoked: 0 });
  });

  it('refuses a catchment-scoped actor updating a staff member assigned platform-wide', async () => {
    await expect(
      adminUsers.update(mukAdminCtx(), adminPerms, catchmentMuk, targetOps, { name: 'Renamed' }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('refuses a catchment-scoped actor revoking the sessions of a platform-wide staff member', async () => {
    await expect(adminUsers.revokeSessions(mukAdminCtx(), adminPerms, catchmentMuk, targetOps))
      .rejects.toMatchObject({ status: 403 });
  });
});

describe('AdminUsersService.update — staff contact changes', () => {
  const fresh = () => new Date().toISOString();
  const stale = () => new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
  const perms = new Set(['users.update']);

  async function staff(phone: string, claimed: boolean, email: string) {
    const id = await seed(
      `INSERT INTO users (phone, email, role, status, name, logto_user_id)
       VALUES ($1, $2, 'ops_lead', 'active', 'Contact Target', $3) RETURNING id`,
      [phone, email, claimed ? `logto-${phone}` : null],
    );
    await assign(id, 'ops_lead');
    return id;
  }

  it('refuses an email change on an unclaimed staff row', async () => {
    const target = await staff('+256700001420', false, 'unclaimed@example.com');
    await expect(
      adminUsers.update(superAdminCtx(), perms, platformWide, target, { email: 'hijack@example.org' }, fresh()),
    ).rejects.toThrow('Change a staff contact by re-issuing their invitation');
  });

  it('refuses a phone change on an unclaimed staff row', async () => {
    const target = await staff('+256700001421', false, 'unclaimed2@example.com');
    await expect(
      adminUsers.update(superAdminCtx(), perms, platformWide, target, { phone: '+256700001499' }, fresh()),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('refuses a claimed staff email change without a fresh sign-in', async () => {
    const target = await staff('+256700001422', true, 'claimed@example.com');
    await expect(
      adminUsers.update(superAdminCtx(), perms, platformWide, target, { email: 'moved@example.org' }, stale()),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('applies a claimed staff email change after a fresh sign-in and audits it redacted', async () => {
    const target = await staff('+256700001423', true, 'claimed2@example.com');
    await adminUsers.update(superAdminCtx(), perms, platformWide, target, { email: 'moved2@example.org' }, fresh());
    const { rows } = await pool.query(
      `SELECT payload FROM audit_log WHERE action = 'users.contact_change' AND target_id = $1`, [target]);
    expect(rows.map((r) => r.payload)).toEqual([{ email: { from: 'example.com', to: 'example.org' } }]);
  });

  it('does not require a fresh sign-in to re-submit an unchanged contact', async () => {
    const target = await staff('+256700001424', true, 'same@example.com');
    const updated = await adminUsers.update(
      superAdminCtx(), perms, platformWide, target, { email: 'same@example.com', name: 'Same' }, stale());
    expect(updated?.name).toBe('Same');
  });

  async function unclaimedLandlord(phone: string, email: string) {
    return seed(
      `INSERT INTO users (phone, email, role, status, name) VALUES ($1, $2, 'landlord', 'active', 'Admin Made') RETURNING id`,
      [phone, email],
    );
  }

  it('refuses an unclaimed landlord email change without a fresh sign-in', async () => {
    const target = await unclaimedLandlord('+256700001426', 'made@example.com');
    await expect(
      adminUsers.update(superAdminCtx(), perms, platformWide, target, { email: 'moved@example.org' }, stale()),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('applies an unclaimed landlord email change after a fresh sign-in and audits it redacted', async () => {
    const target = await unclaimedLandlord('+256700001427', 'made2@example.com');
    await pool.query(`INSERT INTO landlords (user_id, legal_name) VALUES ($1, 'Admin Made')`, [target]);
    await adminUsers.update(superAdminCtx(), perms, platformWide, target, { email: 'landlord-moved@example.org' }, fresh());
    const { rows } = await pool.query(
      `SELECT payload FROM audit_log WHERE action = 'users.contact_change' AND target_id = $1`, [target]);
    expect(rows.map((r) => r.payload)).toEqual([{ email: { from: 'example.com', to: 'example.org' } }]);
  });

  it('refuses an email change on a never-claimed former staff row whose assignment was revoked', async () => {
    const target = await staff('+256700001428', false, 'former@example.com');
    await pool.query(`UPDATE user_role_assignments SET revoked_at = now() WHERE user_id = $1`, [target]);
    await expect(
      adminUsers.update(superAdminCtx(), perms, platformWide, target, { email: 'former-hijack@example.org' }, fresh()),
    ).rejects.toThrow('Change a staff contact by re-issuing their invitation');
  });

  it('refuses an email change on an unclaimed row with a staff users.role and no assignments', async () => {
    const target = await seed(
      `INSERT INTO users (phone, email, role, status, name) VALUES ($1, 'legacy@example.com', 'ops_lead', 'active', 'Legacy') RETURNING id`,
      ['+256700001429'],
    );
    await expect(
      adminUsers.update(superAdminCtx(), perms, platformWide, target, { email: 'legacy-hijack@example.org' }, fresh()),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('allows an unclaimed student email change after a fresh sign-in', async () => {
    const target = await seed(
      `INSERT INTO users (phone, email, role, status, name) VALUES ($1, 'stu@example.com', 'student', 'active', 'Stu') RETURNING id`,
      ['+256700001425'],
    );
    await pool.query(`INSERT INTO students (user_id, university) VALUES ($1, 'MUK')`, [target]);
    const updated = await adminUsers.update(superAdminCtx(), perms, platformWide, target, { email: 'stu2@example.com' }, fresh());
    expect(updated?.email).toBe('stu2@example.com');
  });
});
