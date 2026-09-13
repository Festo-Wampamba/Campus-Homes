import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { PoolClient } from 'pg';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { AuditService } from '../ops/audit.service';
import type { LogtoManagementClient } from '../auth/logto-management.client';
import { AdminUsersService } from './admin-users.service';

const actor: RlsContext = { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin' };
const target = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function make(targetRow: { deletedAt: Date | null; isSuperAdmin: boolean } | null) {
  const queries: string[] = [];
  const client = {
    query: jest.fn(async (text: string) => {
      queries.push(text.replace(/\s+/g, ' ').trim());
      if (text.includes('FROM users u WHERE u.id = $1 FOR UPDATE')) {
        return { rows: targetRow ? [{ id: target, ...targetRow }] : [] };
      }
      return { rows: [] };
    }),
  } as unknown as PoolClient;
  const rlsDb = { run: async (_c: unknown, fn: (_d: unknown, cl: PoolClient) => unknown) => fn({}, client) } as RlsDb;
  const audit = { record: jest.fn(async () => undefined) } as unknown as AuditService;
  const service = new AdminUsersService(rlsDb, audit, {} as LogtoManagementClient);
  return { service, queries, audit };
}

describe('AdminUsersService.purgeUser', () => {
  it('hard-deletes a soft-deleted non-super-admin and records the audit', async () => {
    const { service, queries, audit } = make({ deletedAt: new Date(), isSuperAdmin: false });
    await expect(service.purgeUser(actor, new Set(), target)).resolves.toEqual({ id: target, purged: true });
    expect(queries.some((q) => q.startsWith('INSERT INTO _pg_g VALUES ($1)'))).toBe(true);
    expect(queries.some((q) => q.includes('DELETE FROM users WHERE id IN (SELECT id FROM _pg_g)'))).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(actor, 'users.purge', 'user', target, {});
  });

  it('refuses to purge your own account', async () => {
    const { service } = make({ deletedAt: new Date(), isSuperAdmin: false });
    await expect(service.purgeUser(actor, new Set(), actor.userId)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires the account to be soft-deleted first', async () => {
    const { service } = make({ deletedAt: null, isSuperAdmin: false });
    await expect(service.purgeUser(actor, new Set(), target)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks purging a super admin without the super-admin tier permission', async () => {
    const { service } = make({ deletedAt: new Date(), isSuperAdmin: true });
    await expect(service.purgeUser(actor, new Set(), target)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a tier-holder to purge a super admin', async () => {
    const { service } = make({ deletedAt: new Date(), isSuperAdmin: true });
    await expect(service.purgeUser(actor, new Set(['roles.manage_super_admin']), target)).resolves.toEqual({ id: target, purged: true });
  });
});
