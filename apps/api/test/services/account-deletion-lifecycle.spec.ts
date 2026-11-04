import { Pool } from 'pg';
import { RlsDb } from '../../src/db/db.module';
import type { LogtoManagementClient } from '../../src/modules/auth/logto-management.client';
import { ProvisioningService } from '../../src/modules/auth/provisioning.service';
import { SessionStore } from '../../src/modules/auth/session.store';
import { AuditService } from '../../src/modules/ops/audit.service';
import { AdminUsersService } from '../../src/modules/staff/admin-users.service';
import { testDatabaseUrl } from '../test-database-url';

const pool = new Pool({ connectionString: testDatabaseUrl() });
const db = new RlsDb(pool);
const provider = { deleteUser: jest.fn(async (id: string) => { void id; }) };
const service = new AdminUsersService(db, new AuditService(db), provider as unknown as LogtoManagementClient);
const provisioning = new ProvisioningService(db);
const sessions = new SessionStore(db);
beforeAll(async () => {
  await pool.query('TRUNCATE users CASCADE');
  await pool.query('TRUNCATE deleted_auth_identities');
});
afterAll(() => pool.end());

it('persists failed cleanup, kills sessions, blocks stale callbacks, retries and allows a fresh identity', async () => {
  const actor = (await pool.query(`INSERT INTO users (name,role,status) VALUES ('Delete tester','admin','active') RETURNING id`)).rows[0].id;
  const claims = { sub: 'lifecycle-delete-sub', email: 'lifecycle-delete@example.test', emailVerified: true };
  const target = (await provisioning.provision(claims, 'consumer'))!;
  const invitation = (await pool.query(`INSERT INTO auth_invitations (name,email,role_key,scope_type,reason,invited_by,expires_at)
    VALUES ('Pending invite',$1,'support_admin','platform_wide','Test deletion invalidates old invitation',$2,now()+interval '1 day') RETURNING id`,
    [claims.email, actor])).rows[0].id;
  const { token } = await sessions.create(target.id);
  expect(await sessions.find(token)).not.toBeNull();
  provider.deleteUser.mockRejectedValueOnce(new Error('provider unavailable'));
  expect(await service.deleteUser({ userId: actor, role: 'admin' }, new Set(), target.id, 'Lifecycle test')).toEqual({
    id: target.id, deleted: true, identityCleanupPending: true,
  });
  expect((await pool.query('SELECT id FROM users WHERE id=$1', [target.id])).rows).toHaveLength(0);
  expect(await sessions.find(token)).toBeNull();
  expect((await pool.query('SELECT id FROM auth_invitations WHERE id=$1', [invitation])).rows).toHaveLength(0);
  expect(await provisioning.provision(claims, 'consumer')).toBeNull();
  expect((await pool.query('SELECT logto_user_id FROM deleted_auth_identities WHERE logto_user_id=$1', [claims.sub])).rows).toHaveLength(1);
  // Runtime app role cannot see the service-only cleanup records.
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); await client.query('SET LOCAL ROLE app_user');
    await client.query("SET LOCAL app.user_role='student'");
    expect((await client.query('SELECT * FROM deleted_auth_identities')).rows).toHaveLength(0);
    await client.query('ROLLBACK');
  } finally { client.release(); }
  await service['retryIdentityDeletions']();
  expect(provider.deleteUser).toHaveBeenCalledTimes(2);
  expect((await pool.query(`SELECT logto_user_id, completed_at IS NOT NULL AS done FROM deleted_auth_identities
    WHERE subject_hash=encode(sha256(convert_to($1,'UTF8')),'hex')`, [claims.sub])).rows).toEqual([{ logto_user_id: null, done: true }]);
  expect(await provisioning.provision(claims, 'consumer')).toBeNull();
  const fresh = await provisioning.provision({ ...claims, sub: 'lifecycle-new-sub' }, 'consumer');
  expect(fresh?.id).toBeDefined(); expect(fresh?.id).not.toBe(target.id);
});
