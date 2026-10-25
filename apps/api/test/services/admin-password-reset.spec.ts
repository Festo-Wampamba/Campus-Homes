/**
 * Super-admin password reset (0075, users.password_reset): a one-time
 * temporary password set through Logto, sessions ended, never stored.
 * Logto is the external boundary, so it is faked here.
 */
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import type { LogtoManagementClient } from '../../src/modules/auth/logto-management.client';
import { AuditService } from '../../src/modules/ops/audit.service';
import { AdminUsersService } from '../../src/modules/staff/admin-users.service';
import { testDatabaseUrl } from '../test-database-url';

const pool = new Pool({ connectionString: testDatabaseUrl(), max: 5 });
const rlsDb = new RlsDb(pool);
const setPassword = jest.fn().mockResolvedValue(undefined);
const adminUsers = new AdminUsersService(rlsDb, new AuditService(rlsDb), { setPassword } as unknown as LogtoManagementClient);

let admin: RlsContext;
let signedInUser: string;
let neverSignedIn: string;
let superAdminTarget: string;
let platformStaffTarget: string;
const superPerms = new Set(['users.password_reset', 'roles.manage_super_admin']);
const platformWide = [{ scopeType: 'platform_wide', scopeId: null }];

beforeAll(async () => {
  await pool.query(`TRUNCATE users RESTART IDENTITY CASCADE`);
  const id = async (sql: string) => (await pool.query(sql)).rows[0].id as string;
  admin = { userId: await id(`INSERT INTO users (phone, role, status) VALUES ('+256710000901', 'admin', 'active') RETURNING id`), role: 'admin', mfaVerified: true };
  signedInUser = await id(`INSERT INTO users (phone, role, status, logto_user_id) VALUES ('+256710000902', 'student', 'active', 'logto-902') RETURNING id`);
  neverSignedIn = await id(`INSERT INTO users (phone, role, status) VALUES ('+256710000903', 'student', 'active') RETURNING id`);
  superAdminTarget = await id(`INSERT INTO users (phone, role, status, logto_user_id) VALUES ('+256710000904', 'admin', 'active', 'logto-904') RETURNING id`);
  platformStaffTarget = await id(`INSERT INTO users (phone, role, status, logto_user_id) VALUES ('+256710000905', 'admin', 'active', 'logto-905') RETURNING id`);
  await assign(superAdminTarget, 'super_admin');
  await assign(platformStaffTarget, 'support_admin');
});

async function assign(userId: string, roleKey: string) {
  await pool.query(`
    INSERT INTO user_role_assignments (user_id, role_id, scope_type, scope_id, assigned_by, reason)
    SELECT $1, id, 'platform_wide', NULL, $1, 'seed' FROM roles WHERE key = $2
  `, [userId, roleKey]);
}

beforeEach(() => setPassword.mockClear());

afterAll(async () => {
  await pool.end();
});

describe('resetPassword', () => {
  it("sets the returned temporary password on the person's Logto identity", async () => {
    const { temporaryPassword } = await adminUsers.resetPassword(admin, superPerms, platformWide, signedInUser);

    expect(setPassword).toHaveBeenCalledWith('logto-902', temporaryPassword);
  });

  it('returns a strong temporary password', async () => {
    const { temporaryPassword } = await adminUsers.resetPassword(admin, superPerms, platformWide, signedInUser);

    expect(temporaryPassword).toMatch(/^[A-Za-z0-9_-]{16}a7K!$/);
  });

  it('signs the person out everywhere', async () => {
    await pool.query(
      `INSERT INTO sessions (id, user_id, token, expires_at) VALUES (gen_random_uuid(), $1, 'reset-test-token', now() + interval '1 day')`,
      [signedInUser],
    );

    await adminUsers.resetPassword(admin, superPerms, platformWide, signedInUser);

    expect((await pool.query(`SELECT 1 FROM sessions WHERE user_id = $1`, [signedInUser])).rowCount).toBe(0);
  });

  it('refuses someone who has never signed in', async () => {
    await expect(adminUsers.resetPassword(admin, superPerms, platformWide, neverSignedIn)).rejects.toThrow(ConflictException);
  });

  it("refuses a super admin's password without roles.manage_super_admin", async () => {
    await expect(
      adminUsers.resetPassword(admin, new Set(['users.password_reset']), platformWide, superAdminTarget),
    ).rejects.toThrow(ForbiddenException);
  });

  it('leaves the Logto password untouched when the target is refused', async () => {
    await adminUsers.resetPassword(admin, new Set(['users.password_reset']), platformWide, superAdminTarget).catch(() => undefined);

    expect(setPassword).not.toHaveBeenCalled();
  });

  it("refuses a staff member outside the actor's own scope", async () => {
    await expect(
      adminUsers.resetPassword(admin, superPerms, [{ scopeType: 'catchment', scopeId: 'MUK' }], platformStaffTarget),
    ).rejects.toThrow(ForbiddenException);
  });
});
