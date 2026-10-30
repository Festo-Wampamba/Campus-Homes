/**
 * OpsService.inviteLandlord: an email that differs only in case or spacing
 * must not create a second account (sign-in links by lower(btrim(email)) and
 * refuses when two rows match), and a Logto failure must leave nothing behind
 * so the invite can simply be retried.
 */
import { ConflictException } from '@nestjs/common';
import { Pool } from 'pg';

import { inviteLandlordSchema, type InviteLandlordInput } from '@campushomes/shared';

import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import type { LogtoManagementClient } from '../../src/modules/auth/logto-management.client';
import type { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { AuditService } from '../../src/modules/ops/audit.service';
import { OpsService } from '../../src/modules/ops/ops.service';
import { testDatabaseUrl } from '../test-database-url';

jest.mock('../../src/modules/auth/auth.email', () => ({
  pickPasswordEmailKind: () => 'set-password',
  sendAuthEmail: jest.fn(async () => undefined),
}));
jest.mock('../../src/config/env', () => ({ loadEnv: () => ({ WEB_ORIGIN: 'https://campushomes.test' }) }));

const pool = new Pool({ connectionString: testDatabaseUrl(), max: 5 });
const rlsDb = new RlsDb(pool);
const logto = {
  createUser: jest.fn(async () => ({ id: 'logto-user-1' })),
  createOneTimeToken: jest.fn(async () => ({ token: 'one-time-token' })),
  deleteUser: jest.fn(async () => undefined),
};
const ops = new OpsService(rlsDb, new AuditService(rlsDb), {} as NotificationsService, logto as unknown as LogtoManagementClient);

let opsLead: string;
const leadCtx = (): RlsContext => ({ userId: opsLead, role: 'ops_lead', mfaVerified: true });

const invite = (overrides: Partial<InviteLandlordInput>): InviteLandlordInput =>
  inviteLandlordSchema.parse({ name: 'Invited Landlord', email: 'owner@example.com', phone: '+256710000501', ...overrides });

const usersWithEmail = async (email: string) =>
  (await pool.query(`SELECT id FROM users WHERE lower(btrim(email)) = $1`, [email])).rowCount;

beforeAll(async () => {
  await pool.query(`TRUNCATE users, landlords, ops_staff CASCADE`);
  opsLead = (await pool.query(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000500', 'ops_lead', 'active') RETURNING id`,
  )).rows[0].id as string;
  await pool.query(`INSERT INTO ops_staff (user_id, team, active) VALUES ($1, 'lead', true)`, [opsLead]);
  await pool.query(
    `INSERT INTO user_role_assignments (user_id, role_id, scope_type, scope_id, assigned_by, reason)
     SELECT $1, id, 'platform_wide', NULL, $1, 'test fixture' FROM roles WHERE key = 'ops_lead'`,
    [opsLead],
  );
});

afterAll(async () => {
  await pool.end();
});

beforeEach(() => jest.clearAllMocks());

it('lowercases and trims the invited email', () => {
  expect(invite({ email: '  Owner.Case@Example.COM ' }).email).toBe('owner.case@example.com');
});

it('stores the invited landlord under the lowercased email', async () => {
  const user = await ops.inviteLandlord(leadCtx(), invite({ email: 'Stored@Example.com', phone: '+256710000502' }));
  expect(user.email).toBe('stored@example.com');
  expect(logto.createUser).toHaveBeenCalledWith(expect.objectContaining({ primaryEmail: 'stored@example.com' }));
});

it('refuses an email an existing account holds in a different case', async () => {
  await pool.query(
    `INSERT INTO users (email, phone, role, status) VALUES ('Mixed.Case@Example.com', '+256710000503', 'student', 'active')`,
  );
  await expect(
    ops.inviteLandlord(leadCtx(), invite({ email: 'mixed.case@example.com', phone: '+256710000504' })),
  ).rejects.toThrow(/email already exists/i);
  expect(await usersWithEmail('mixed.case@example.com')).toBe(1);
  expect(logto.createUser).not.toHaveBeenCalled();
});

it('refuses a phone number another account already has', async () => {
  await expect(
    ops.inviteLandlord(leadCtx(), invite({ email: 'phone.taken@example.com', phone: '+256710000503' })),
  ).rejects.toBeInstanceOf(ConflictException);
  expect(await usersWithEmail('phone.taken@example.com')).toBe(0);
});

it('rolls back when Logto refuses the identity, so the retry works', async () => {
  logto.createUser.mockRejectedValueOnce(new Error('Logto unavailable'));
  const input = invite({ email: 'retry@example.com', phone: '+256710000505' });
  await expect(ops.inviteLandlord(leadCtx(), input)).rejects.toThrow(/Logto unavailable/);
  expect(await usersWithEmail('retry@example.com')).toBe(0);

  const user = await ops.inviteLandlord(leadCtx(), input);
  expect(user.email).toBe('retry@example.com');
});

it('deletes the new Logto identity when a later step fails', async () => {
  logto.createOneTimeToken.mockRejectedValueOnce(new Error('token failed'));
  await expect(
    ops.inviteLandlord(leadCtx(), invite({ email: 'token.fail@example.com', phone: '+256710000506' })),
  ).rejects.toThrow(/token failed/);
  expect(logto.deleteUser).toHaveBeenCalledWith('logto-user-1');
  expect(await usersWithEmail('token.fail@example.com')).toBe(0);
});
