import 'reflect-metadata';

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';

import type { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { PERMISSION_KEY } from '../auth/permissions';
import type { PermissionedRequest } from '../auth/permissions';
import type { LogtoManagementClient } from '../auth/logto-management.client';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminUsersService } from './admin-users.service';
import type { AuditService } from '../ops/audit.service';

const actor: RlsContext = {
  userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  role: 'admin',
};
const target = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function dashboardHarness() {
  const queries: string[] = [];
  const client = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim());
      if (sql.includes('SELECT id FROM roles WHERE key = $1')) {
        return { rows: [{ id: 'role-id' }] };
      }
      if (sql.includes('SELECT id, key FROM permissions')) {
        return { rows: [{ id: 'permission-id', key: 'settings.manage' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
  } as unknown as PoolClient;
  const rlsDb = {
    run: async (_context: unknown, fn: (_db: unknown, dbClient: PoolClient) => unknown) => fn({}, client),
  } as unknown as RlsDb;
  const audit = { record: jest.fn(async () => undefined) } as unknown as AuditService;
  return { service: new AdminDashboardService(rlsDb, audit), client, queries };
}

type DetailHarnessOptions = {
  accountType: string | null;
  user?: Record<string, unknown>;
};

function detailHarness({ accountType, user }: DetailHarnessOptions) {
  const queries: string[] = [];
  const detailUser = {
    id: target,
    name: 'Target User',
    email: 'target@example.test',
    phone: '+256700000001',
    accountType,
    status: 'active',
    university: 'MUK',
    yearOfStudy: 3,
    legalName: 'Target Holdings',
    kycStatus: 'verified',
    whatsappNumber: '+256700000002',
    businessType: 'individual_landlord',
    businessTypeOther: null,
    ...(user ?? {}),
  };
  const client = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim());
      if (sql.includes('SELECT u.role::text AS "accountType"')) {
        return { rows: accountType ? [{ accountType }] : [] };
      }
      if (sql.includes('SELECT u.id, u.name, u.email')) {
        return { rows: [detailUser] };
      }
      if (sql.includes('FROM user_role_assignments')) {
        return { rows: [{ id: 'assignment-id', roleKey: 'support_admin' }] };
      }
      if (sql.includes('FROM user_permission_grants')) {
        return { rows: [{ id: 'grant-id', permissionKey: 'audit.read' }] };
      }
      if (sql.includes('FROM property_memberships')) {
        return { rows: [{ id: 'membership-id', propertyName: 'Property' }] };
      }
      return { rows: [] };
    }),
  } as unknown as PoolClient;
  const rlsDb = {
    run: async (_context: unknown, fn: (_db: unknown, dbClient: PoolClient) => unknown) => fn({}, client),
  } as unknown as RlsDb;
  const audit = { record: jest.fn(async () => undefined) } as unknown as AuditService;
  const service = new AdminUsersService(rlsDb, audit, {} as LogtoManagementClient);
  return { service, queries };
}

describe('admin authorization regression coverage', () => {
  it('guards role-matrix writes with the Super Admin tier permission and forwards it to the service', async () => {
    expect(Reflect.getMetadata(
      PERMISSION_KEY,
      AdminDashboardController.prototype.updateRolePermissions,
    )).toBe('roles.manage_super_admin');

    const permissions = new Set(['roles.manage_super_admin']);
    const dashboard = { updateRolePermissions: jest.fn().mockResolvedValue({ ok: true }) };
    const controller = new AdminDashboardController(dashboard as unknown as AdminDashboardService);
    const request = {
      permissions,
      effectiveRole: 'admin',
      session: {
        user: { id: actor.userId },
        access: { roles: ['super_admin'], assurance: { mfaVerified: true } },
      },
    } as unknown as PermissionedRequest;

    await controller.updateRolePermissions(request, 'platform_admin', { permissionKeys: ['settings.manage'] } as never);

    expect(dashboard.updateRolePermissions).toHaveBeenCalledWith(
      expect.objectContaining({ userId: actor.userId, role: 'admin' }),
      permissions,
      'platform_admin',
      { permissionKeys: ['settings.manage'] },
    );
  });

  it('denies a lower role from changing the role matrix even when it has settings.manage', async () => {
    const { service, client } = dashboardHarness();

    await expect(service.updateRolePermissions(
      actor,
      new Set(['settings.manage']),
      'platform_admin',
      { permissionKeys: ['roles.manage_super_admin'] },
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('allows a Super Admin to edit a normal role permission set', async () => {
    const { service } = dashboardHarness();

    await expect(service.updateRolePermissions(
      actor,
      new Set(['roles.manage_super_admin']),
      'platform_admin',
      { permissionKeys: ['settings.manage'] },
    )).resolves.toEqual({ roleId: 'role-id', permissionKeys: ['settings.manage'] });
  });

  it('denies a students reader from opening a landlord record by UUID', async () => {
    const { service, queries } = detailHarness({ accountType: 'landlord' });

    await expect(service.detail(target, new Set(['students.read']))).rejects.toBeInstanceOf(ForbiddenException);
    expect(queries).toHaveLength(1);
    expect(queries[0]).not.toContain('u.email');
  });

  it('allows a category-matched reader to view profile data without RBAC metadata', async () => {
    const { service, queries } = detailHarness({ accountType: 'student' });

    const result = await service.detail(target, new Set(['students.read']));
    expect(result).toMatchObject({
      user: { id: target, email: 'target@example.test', university: 'MUK', yearOfStudy: 3 },
      assignments: [],
      directPermissions: [],
      memberships: [],
    });
    expect(result.user).not.toHaveProperty('legalName');
    expect(result.user).not.toHaveProperty('kycStatus');
    expect(queries).toHaveLength(2);
  });

  it('does not leak student particulars through a landlord detail response', async () => {
    const { service } = detailHarness({ accountType: 'landlord' });

    const result = await service.detail(target, new Set(['landlords.read']));
    expect(result.user).toMatchObject({ legalName: 'Target Holdings', kycStatus: 'verified' });
    expect(result.user).not.toHaveProperty('university');
    expect(result.user).not.toHaveProperty('yearOfStudy');
  });

  it('allows an explicit RBAC reader to receive assignments and direct grants for a matched target', async () => {
    const { service } = detailHarness({ accountType: 'admin' });

    await expect(service.detail(target, new Set(['staff.read', 'roles.read']))).resolves.toMatchObject({
      assignments: [{ id: 'assignment-id', roleKey: 'support_admin' }],
      directPermissions: [{ id: 'grant-id', permissionKey: 'audit.read' }],
      memberships: [{ id: 'membership-id', propertyName: 'Property' }],
    });
  });

  it('keeps missing users as not-found rather than treating them as a category denial', async () => {
    const { service } = detailHarness({ accountType: null });

    await expect(service.detail(target, new Set(['students.read']))).rejects.toBeInstanceOf(NotFoundException);
  });
});
