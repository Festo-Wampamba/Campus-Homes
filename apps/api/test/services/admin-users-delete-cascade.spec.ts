/**
 * Regression: hard-deleting a staff member who was enrolled through the invite
 * flow used to 500 with a 23514 check violation. runPurgeCascade nulled the
 * user's auth_invitations actor columns, but invited_by is NOT NULL and the
 * accepted/cancelled status CHECKs require accepted_by/cancelled_by non-null —
 * so the row could never be anonymized. The cascade now deletes those rows.
 *
 * Runs against the real docker test DB (the mocked-client unit specs cannot
 * exercise a live constraint).
 */
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import type { LogtoManagementClient } from '../../src/modules/auth/logto-management.client';
import { AuditService } from '../../src/modules/ops/audit.service';
import { AdminUsersService } from '../../src/modules/staff/admin-users.service';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const audit = new AuditService(rlsDb);
const adminUsers = new AdminUsersService(rlsDb, audit, {} as LogtoManagementClient);

async function seedId(sql: string, params: unknown[] = []): Promise<string> {
  const res = await pool.query(sql, params);
  return res.rows[0].id as string;
}

let inviter: string;
let target: string;
let invitationId: string;

beforeAll(async () => {
  await pool.query(`TRUNCATE users RESTART IDENTITY CASCADE`);
  inviter = await seedId(
    `INSERT INTO users (phone, role, status, name) VALUES ('+256700009001', 'admin', 'active', 'Inviter') RETURNING id`,
  );
  target = await seedId(
    `INSERT INTO users (phone, role, status, name) VALUES ('+256700009002', 'ops_inspector', 'active', 'Invited Inspector') RETURNING id`,
  );
  const roleId = await seedId(`SELECT id FROM roles WHERE key = 'ops_inspector'`);
  const assignmentId = await seedId(
    `INSERT INTO user_role_assignments (user_id, role_id, scope_type, assigned_by, reason)
     VALUES ($1, $2, 'platform_wide', $3, 'enrolled') RETURNING id`,
    [target, roleId, inviter],
  );
  invitationId = await seedId(
    `INSERT INTO auth_invitations
       (name, email, role_key, scope_type, reason, invited_by, target_user_id,
        expires_at, status, accepted_at, accepted_by, assignment_id)
     VALUES ('Invited Inspector', 'invited@example.com', 'ops_inspector', 'platform_wide',
        'enrolled', $1, $2, now() + interval '1 day', 'accepted', now(), $2, $3)
     RETURNING id`,
    [inviter, target, assignmentId],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('AdminUsersService.deleteUser — invited staff', () => {
  it('hard-deletes a staff member enrolled via an accepted invitation', async () => {
    const actor: RlsContext = { userId: inviter, role: 'admin' };
    await expect(adminUsers.deleteUser(actor, new Set(), target, 'offboarded')).resolves.toEqual({
      id: target,
      deleted: true,
    });
  });

  it('removes the accepted invitation row along with the user', async () => {
    const { rows } = await pool.query(`SELECT id FROM auth_invitations WHERE id = $1`, [invitationId]);
    expect(rows).toHaveLength(0);
  });
});
