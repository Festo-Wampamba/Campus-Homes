import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { RlsDb } from '../../db/db.module';
import type { AuthenticatedRequest } from './auth.guard';
import { RolesGuard, rlsCtx } from './roles';

function request(roles: string[], mfaVerified = false): AuthenticatedRequest {
  return { session: {
    user: { id: 'user', role: 'admin', status: 'active' },
    access: { roles, workspaces: ['student', 'landlord', 'ops', 'admin'],
      onboarding: { student: false, landlord: false },
      assurance: { authenticatedAt: new Date().toISOString(), mfaVerified } },
  } } as unknown as AuthenticatedRequest;
}

/** Stands in for loadPermissions' two queries: role-derived rows, then direct grants. */
function assignedRoles(roleKey: string, scopeType = 'platform_wide', scopeId: string | null = null) {
  const rows = [{ permissionKey: 'audit.read', requiresStepUp: false, roleKey, scopeType, scopeId }];
  const query = { select: () => query, from: () => query, innerJoin: () => query,
    where: jest.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce([]) };
  return { run: (_ctx: unknown, fn: (db: unknown) => unknown) => fn(query) } as unknown as RlsDb;
}

function check(req: AuthenticatedRequest, required?: string[], rlsDb?: RlsDb) {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  const ctx = { getHandler: () => ({}), getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
  return new RolesGuard(reflector, rlsDb).canActivate(ctx);
}

describe('effective route role', () => {
  it('never regrants a revoked staff role from the legacy column', () => {
    expect(check(request(['student'], true), ['admin'])).toBe(false);
  });
  it('requires verified MFA even when staff used consumer sign-in', () => {
    expect(check(request(['super_admin']), ['admin'])).toBe(false);
  });
  it.each(['finance_admin', 'support_admin', 'auditor'])(
    'does not let %s inherit broad legacy admin routes',
    (role) => {
      expect(check(request([role], true), ['admin'])).toBe(false);
    },
  );
  it.each(['super_admin', 'platform_admin'])(
    'allows %s to use broad legacy admin routes after MFA',
    async (role) => {
      expect(await check(request([role], true), ['admin'], assignedRoles(role))).toBe(true);
    },
  );
  it.each(['super_admin', 'platform_admin'])(
    'does not let a catchment-scoped %s use full-platform admin routes',
    async (role) => {
      expect(await check(request([role], true), ['admin'], assignedRoles(role, 'catchment', 'MUK'))).toBe(false);
    },
  );
  it('fails closed on admin routes when assignment scope cannot be loaded', async () => {
    expect(await check(request(['super_admin'], true), ['admin'])).toBe(false);
  });
  it('selects the consumer role required by a route for a multi-role user', () => {
    const req = request(['student', 'landlord', 'super_admin']);
    expect(check(req, ['landlord'])).toBe(true);
    expect(rlsCtx(req).role).toBe('landlord');
  });
  it('selects a validated staff role with MFA', () => {
    const req = request(['student', 'ops_lead'], true);
    expect(check(req, ['ops_lead'])).toBe(true);
    expect(rlsCtx(req).role).toBe('ops_lead');
  });
  it('defaults endpoints without roles to personal access', () => {
    const req = request(['super_admin'], true);
    expect(check(req)).toBe(true);
    expect(rlsCtx(req).role).toBe('student');
  });
});
