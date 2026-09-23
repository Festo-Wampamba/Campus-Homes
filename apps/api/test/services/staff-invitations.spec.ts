/**
 * Staff invitation lifecycle against the real docker test DB: one contact =
 * one account = one role, 24h expiry, edit, and permanent delete.
 */
import { Pool } from 'pg';

import type { StaffRoleKey } from '@campushomes/shared';

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
const logtoManagement = {
  createUser: jest.fn(),
  createOneTimeToken: jest.fn().mockResolvedValue({ token: 'unused' }),
} as unknown as LogtoManagementClient;
const staff = new StaffService(rlsDb, new AuditService(rlsDb), logtoManagement);

const PERMS = new Set(['staff.invite', 'roles.assign']);
const PLATFORM = [{ scopeType: 'platform_wide', scopeId: null }];
let admin: string;
const ctx = (): RlsContext => ({ userId: admin, role: 'admin' });

function invite(email: string, roleKey: StaffRoleKey = 'ops_inspector') {
  return staff.invite(ctx(), PERMS, PLATFORM, {
    name: 'Invitee', email, roleKey, scopeType: 'platform_wide', reason: 'test',
  });
}

async function invitationRow(id: string) {
  return (await pool.query(`SELECT status, role_key AS "roleKey", email,
    expires_at <= now() + interval '24 hours' AS "within24h" FROM auth_invitations WHERE id = $1`, [id])).rows[0];
}

beforeAll(async () => {
  await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');
  admin = (await pool.query(`INSERT INTO users (phone, role, status, name)
    VALUES ('+256700000501', 'admin', 'active', 'Admin') RETURNING id`)).rows[0].id;
  await pool.query(`INSERT INTO user_role_assignments (user_id, role_id, scope_type, assigned_by, reason)
    SELECT $1, id, 'platform_wide', $1, 'bootstrap' FROM roles WHERE key = 'super_admin'`, [admin]);
  const inspector = (await pool.query(`INSERT INTO users (email, role, status, name)
    VALUES ('taken@campushomes.ug', 'ops_inspector', 'active', 'Existing') RETURNING id`)).rows[0].id;
  await pool.query(`INSERT INTO user_role_assignments (user_id, role_id, scope_type, assigned_by, reason)
    SELECT $1, id, 'platform_wide', $2, 'seed' FROM roles WHERE key = 'ops_inspector'`, [inspector, admin]);
});

afterAll(() => pool.end());

describe('invite — one contact, one role', () => {
  it('rejects an email already registered, naming the role it holds', async () => {
    await expect(invite('Taken@campushomes.ug', 'ops_lead')).rejects.toThrow(/already registered as Ops Inspector/);
  });

  it('rejects an email with a live invitation, naming the invited role', async () => {
    await invite('twice@campushomes.ug', 'ops_inspector');
    await expect(invite('twice@campushomes.ug', 'ops_lead')).rejects.toThrow(/pending invitation as Ops Inspector/);
  });

  it('expires a new invitation within 24 hours', async () => {
    const created = await invite('fresh@campushomes.ug');
    expect((await invitationRow(created.id)).within24h).toBe(true);
  });

  it('cancels an expired invitation when the contact is re-invited', async () => {
    const old = await invite('lapsed@campushomes.ug');
    await pool.query(`UPDATE auth_invitations SET expires_at = now() - interval '1 minute' WHERE id = $1`, [old.id]);
    await invite('lapsed@campushomes.ug');
    expect((await invitationRow(old.id)).status).toBe('cancelled');
  });
});

describe('update', () => {
  it('changes the role of a pending invitation', async () => {
    const created = await invite('edit-role@campushomes.ug', 'ops_inspector');
    await staff.updateInvitation(ctx(), PERMS, PLATFORM, created.id, {
      name: 'Renamed', email: 'edit-role@campushomes.ug', roleKey: 'ops_lead', scopeType: 'platform_wide', reason: 'promoted',
    });
    expect((await invitationRow(created.id)).roleKey).toBe('ops_lead');
  });

  it('refuses to move an invitation onto a registered email', async () => {
    const created = await invite('edit-email@campushomes.ug');
    await expect(staff.updateInvitation(ctx(), PERMS, PLATFORM, created.id, {
      name: 'Invitee', email: 'taken@campushomes.ug', roleKey: 'ops_inspector', scopeType: 'platform_wide', reason: 'test',
    })).rejects.toThrow(/already registered as Ops Inspector/);
  });
});

describe('deleteInvitation', () => {
  it('permanently removes a cancelled invitation', async () => {
    const created = await invite('delete-me@campushomes.ug');
    await staff.cancelInvitation(ctx(), PERMS, PLATFORM, created.id);
    await staff.deleteInvitation(ctx(), PERMS, PLATFORM, created.id);
    expect(await invitationRow(created.id)).toBeUndefined();
  });

  it('refuses to delete a live pending invitation', async () => {
    const created = await invite('keep-me@campushomes.ug');
    await expect(staff.deleteInvitation(ctx(), PERMS, PLATFORM, created.id))
      .rejects.toThrow('Only cancelled or expired invitations can be deleted');
  });
});

describe('grantRole — one staff role per account', () => {
  it('blocks a second, different staff role', async () => {
    const lead = (await pool.query(`INSERT INTO users (phone, role, status, name)
      VALUES ('+256700000502', 'ops_lead', 'active', 'Lead') RETURNING id`)).rows[0].id;
    await staff.grantRole(ctx(), PERMS, PLATFORM, lead, { roleKey: 'ops_lead', scopeType: 'platform_wide', reason: 'seed' });
    await expect(staff.grantRole(ctx(), PERMS, PLATFORM, lead, {
      roleKey: 'ops_inspector', scopeType: 'platform_wide', reason: 'second role',
    })).rejects.toThrow(/already holds the "ops_lead" role/);
  });
});
