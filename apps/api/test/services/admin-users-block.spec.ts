import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { createDbPool } from '../../src/db/client';
import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import type { LogtoManagementClient } from '../../src/modules/auth/logto-management.client';
import { AuditService } from '../../src/modules/ops/audit.service';
import { AdminUsersService } from '../../src/modules/staff/admin-users.service';
import { testDatabaseUrl } from '../test-database-url';
const pool = createDbPool(testDatabaseUrl());
const db = new RlsDb(pool);
const service = new AdminUsersService(db, new AuditService(db), {} as LogtoManagementClient);
const scope = [{ scopeType: 'platform_wide', scopeId: null }];
let actor: RlsContext;
let target: string;
const permission = new Set(['accounts.suspend', 'roles.manage_super_admin']);
beforeEach(async () => {
  await pool.query('TRUNCATE users CASCADE');
  const ids = (await pool.query(`INSERT INTO users(name,role,status) VALUES('Operator','admin','active'),('Resident','student','active') RETURNING id`)).rows;
  actor = { userId: ids[0].id, role: 'admin' }; target = ids[1].id;
});
afterAll(() => pool.end());
test('blocking revokes sessions and retains particulars, reason and role history; unblocking requires new sign-in', async () => {
  await pool.query(`INSERT INTO sessions(id,token,user_id,expires_at) VALUES($1,$1,$2,now()+interval '1 day')`, [randomUUID(), target]);
  await expect(service.setBlocked(actor, permission, scope, target, { blocked: true, reason: 'Awaiting documents' })).resolves.toEqual({ id: target, status: 'suspended' });
  expect((await pool.query('SELECT name,status FROM users WHERE id=$1', [target])).rows).toEqual([{ name: 'Resident', status: 'suspended' }]);
  expect((await pool.query('SELECT id FROM sessions WHERE user_id=$1', [target])).rows).toEqual([]);
  expect((await pool.query("SELECT payload->>'reason' AS reason FROM audit_log WHERE action='users.block' AND target_id=$1", [target])).rows).toEqual([{ reason: 'Awaiting documents' }]);
  await expect(service.setBlocked(actor, permission, scope, target, { blocked: false, reason: 'Documents accepted' })).resolves.toEqual({ id: target, status: 'active' });
  expect((await pool.query('SELECT id FROM sessions WHERE user_id=$1', [target])).rows).toEqual([]);
});
test('unblocking restores pending approval and repeated blocking is harmless', async () => {
  await pool.query("UPDATE users SET status='pending' WHERE id=$1", [target]);
  await service.setBlocked(actor, permission, scope, target, { blocked: true, reason: 'Check documents' });
  await service.setBlocked(actor, permission, scope, target, { blocked: true, reason: 'Still checking' });
  await expect(service.setBlocked(actor, permission, scope, target, { blocked: false, reason: 'Check completed' })).resolves.toEqual({ id: target, status: 'pending' });
});
test('rejects self lockout and lower-tier changes to leadership', async () => {
  await expect(service.setBlocked(actor, permission, scope, actor.userId, { blocked: true, reason: 'Self block' })).rejects.toBeInstanceOf(ForbiddenException);
  await pool.query(`INSERT INTO user_role_assignments(user_id,role_id,scope_type,assigned_by,reason) SELECT $1,id,'platform_wide',$2,'fixture' FROM roles WHERE key='director'`, [target, actor.userId]);
  await expect(service.setBlocked(actor, new Set(['accounts.suspend']), scope, target, { blocked: true, reason: 'Check documents' })).rejects.toBeInstanceOf(ForbiddenException);
});
test('protects the last active Super Admin', async () => {
  await pool.query(`INSERT INTO user_role_assignments(user_id,role_id,scope_type,assigned_by,reason) SELECT $1,id,'platform_wide',$2,'fixture' FROM roles WHERE key='super_admin'`, [target, actor.userId]);
  await expect(service.setBlocked(actor, permission, scope, target, { blocked: true, reason: 'Check documents' })).rejects.toThrow('last active Super Admin');
});
