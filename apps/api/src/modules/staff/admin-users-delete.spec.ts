import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { AuditService } from '../ops/audit.service';
import type { LogtoManagementClient } from '../auth/logto-management.client';
import { AdminUsersService } from './admin-users.service';

const actor: RlsContext = { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin' };
const target = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** superAdminCount is only consulted when the target is a super admin. */
function make(targetRow: { isSuperAdmin: boolean; isActiveSuperAdmin?: boolean } | null, superAdminCount = 2) {
  const logto = { deleteUser: jest.fn(async () => undefined) };
  const queries: string[] = [];
  const client = {
    query: jest.fn(async (text: string) => {
      queries.push(text.replace(/\s+/g, ' ').trim());
      if (text.includes('AND u.deleted_at IS NULL FOR UPDATE')) {
        return { rows: targetRow ? [{ id: target, email: 'Boss@CampusHomes.co.ug', logtoUserId: 'logto-boss', isActiveSuperAdmin: targetRow.isSuperAdmin, ...targetRow }] : [] };
      }
      if (text.includes('count(DISTINCT ura.user_id)')) {
        return { rows: [{ count: String(superAdminCount) }] };
      }
      return { rows: [] };
    }),
  } as unknown as PoolClient;
  const rlsDb = { run: async (_c: unknown, fn: (_d: unknown, cl: PoolClient) => unknown) => fn({}, client) } as RlsDb;
  const audit = { record: jest.fn(async () => undefined) } as unknown as AuditService;
  const service = new AdminUsersService(rlsDb, audit, logto as unknown as LogtoManagementClient);
  return { service, queries, audit, logto };
}

describe('AdminUsersService.deleteUser', () => {
  it('hard-deletes an active non-super-admin and records the audit with the reason', async () => {
    const { service, queries, audit } = make({ isSuperAdmin: false });
    await expect(service.deleteUser(actor, new Set(), target, 'left the platform')).resolves.toEqual({ id: target, deleted: true });
    expect(queries.some((q) => q.includes('DELETE FROM users WHERE id IN (SELECT id FROM _pg_g)'))).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(actor, 'users.delete', 'user', target, { reason: 'left the platform' });
  });

  it('refuses to delete your own account', async () => {
    const { service } = make({ isSuperAdmin: false });
    await expect(service.deleteUser(actor, new Set(), actor.userId, 'x')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws when the user does not exist or is already gone', async () => {
    const { service } = make(null);
    await expect(service.deleteUser(actor, new Set(), target, 'x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('blocks deleting a super admin without the super-admin tier permission', async () => {
    const { service } = make({ isSuperAdmin: true });
    await expect(service.deleteUser(actor, new Set(), target, 'x')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks deleting the last active super admin even with the tier permission', async () => {
    const { service } = make({ isSuperAdmin: true }, 1);
    await expect(service.deleteUser(actor, new Set(['roles.manage_super_admin']), target, 'x')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a tier-holder to delete a super admin when the typed email matches', async () => {
    const { service } = make({ isSuperAdmin: true }, 2);
    await expect(service.deleteUser(actor, new Set(['roles.manage_super_admin']), target, 'x', ' boss@campushomes.co.ug '))
      .resolves.toEqual({ id: target, deleted: true });
  });

  it('refuses to delete a super admin without the typed email', async () => {
    const { service } = make({ isSuperAdmin: true }, 2);
    await expect(service.deleteUser(actor, new Set(['roles.manage_super_admin']), target, 'x'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to delete a super admin when the typed email differs', async () => {
    const { service } = make({ isSuperAdmin: true }, 2);
    await expect(service.deleteUser(actor, new Set(['roles.manage_super_admin']), target, 'x', 'other@campushomes.co.ug'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('needs no typed email when the Super Admin assignment is not active yet', async () => {
    const { service } = make({ isSuperAdmin: true, isActiveSuperAdmin: false }, 2);
    await expect(service.deleteUser(actor, new Set(['roles.manage_super_admin']), target, 'x'))
      .resolves.toEqual({ id: target, deleted: true });
  });

  it('removes the Logto identity so a new account cannot inherit its 2-step setup', async () => {
    const { service, logto } = make({ isSuperAdmin: false });
    await service.deleteUser(actor, new Set(), target, 'left');
    await new Promise((resolve) => setImmediate(resolve));
    expect(logto.deleteUser).toHaveBeenCalledWith('logto-boss');
  });

  it('still reports the delete when Logto is unreachable', async () => {
    const { service, logto } = make({ isSuperAdmin: false });
    logto.deleteUser.mockRejectedValueOnce(new Error('down'));
    await expect(service.deleteUser(actor, new Set(), target, 'left')).resolves.toEqual({ id: target, deleted: true });
  });
});
