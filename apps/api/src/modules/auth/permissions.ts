import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  NotImplementedException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq, isNull, or, sql } from 'drizzle-orm';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { permissions, rolePermissions, userRoleAssignments } from '../../db/schema';
import type { AuthenticatedRequest } from './auth.guard';

export const PERMISSION_KEY = 'permission';

/** Restricts a route to callers holding the given permission. Must be paired
 * with AuthGuard (AuthGuard attaches the session PermissionsGuard reads). */
export const RequirePermission = (permission: string) => SetMetadata(PERMISSION_KEY, permission);

export interface RoleAssignment {
  scopeType: string;
  scopeId: string | null;
}

export interface PermissionedRequest extends AuthenticatedRequest {
  permissions: Set<string>;
  assignments: RoleAssignment[];
}

const SERVICE_CTX: RlsContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'service_role',
};

/** Loads every permission granted by a user's active (not revoked, within
 * validity window) role assignments. Runs as service_role — these tables are
 * svc_all-only under RLS, same posture as accounts/verifications. */
export async function loadPermissions(
  rlsDb: RlsDb,
  userId: string,
): Promise<{ permissions: Set<string>; stepUpRequired: Set<string>; assignments: RoleAssignment[] }> {
  const rows = await rlsDb.run(SERVICE_CTX, (db) =>
    db
      .select({
        permissionKey: permissions.key,
        requiresStepUp: permissions.requiresStepUp,
        scopeType: userRoleAssignments.scopeType,
        scopeId: userRoleAssignments.scopeId,
      })
      .from(userRoleAssignments)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoleAssignments.roleId))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(
        and(
          eq(userRoleAssignments.userId, userId),
          isNull(userRoleAssignments.revokedAt),
          sql`${userRoleAssignments.validFrom} <= now()`,
          or(isNull(userRoleAssignments.validUntil), sql`${userRoleAssignments.validUntil} > now()`),
        ),
      ),
  );

  return {
    permissions: new Set(rows.map((r) => r.permissionKey)),
    stepUpRequired: new Set(rows.filter((r) => r.requiresStepUp).map((r) => r.permissionKey)),
    assignments: rows.map((r) => ({ scopeType: r.scopeType, scopeId: r.scopeId })),
  };
}

/** True if any assignment covers the target scope: platform_wide covers
 * everything; a catchment assignment covers the same catchment or 'all'. */
export function hasCoveringScope(
  assignments: RoleAssignment[],
  targetScopeType: string,
  targetScopeId: string | null,
): boolean {
  return assignments.some((a) => {
    if (a.scopeType === 'platform_wide') return true;
    if (targetScopeType === 'platform_wide') return false;
    return a.scopeId === 'all' || a.scopeId === targetScopeId;
  });
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rlsDb: RlsDb,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) {
      return true;
    }

    const req = context.switchToHttp().getRequest<PermissionedRequest>();
    const { permissions: granted, stepUpRequired, assignments } = await loadPermissions(
      this.rlsDb,
      req.session.user.id,
    );
    req.permissions = granted;
    req.assignments = assignments;

    if (!granted.has(required)) {
      return false;
    }
    if (stepUpRequired.has(required)) {
      // Real MFA reverification ships in the Auth phase — fail closed rather
      // than silently allowing a step-up-gated action.
      throw new NotImplementedException(`${required} requires step-up verification (not yet available)`);
    }
    return true;
  }
}
