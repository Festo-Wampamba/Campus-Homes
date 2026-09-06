import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import type { RlsDb } from '../../db/db.module';
import { hasCoveringScope, loadPermissions, PermissionsGuard, type PermissionedRequest } from './permissions';

function database() {
  const rows = [
    { permissionKey: 'roles.assign', requiresStepUp: false, scopeType: 'property', scopeId: 'A' },
    { permissionKey: 'audit.read', requiresStepUp: false, scopeType: 'platform_wide', scopeId: null },
  ];
  const query = { select: () => query, from: () => query, innerJoin: () => query,
    where: jest.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce([]) };
  return { run: (_ctx: unknown, fn: (db: unknown) => unknown) => fn(query) } as unknown as RlsDb;
}

describe('permission scope association', () => {
  it('does not expose scoped permissions as unrestricted to legacy loaders', async () => {
    const loaded = await loadPermissions(database(), 'user');
    expect(loaded.permissions.has('roles.assign')).toBe(false);
    expect(loaded.permissions.has('audit.read')).toBe(true);
  });
  it('does not let an unrelated global read permission widen a role grant', async () => {
    const req = { session: { user: { id: 'user' }, access: {
      roles: ['platform_admin'], assurance: { mfaVerified: true, authenticatedAt: new Date().toISOString() },
    } } } as unknown as PermissionedRequest;
    const ctx = { getHandler: () => ({}), getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
    const guard = new PermissionsGuard({ getAllAndOverride: () => 'roles.assign' } as unknown as Reflector, database());
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(hasCoveringScope(req.assignments, 'property', 'A')).toBe(true);
    expect(hasCoveringScope(req.assignments, 'property', 'B')).toBe(false);
  });
});
