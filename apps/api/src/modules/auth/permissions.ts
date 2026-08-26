import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq, isNull, or, sql } from 'drizzle-orm';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import {
  permissions,
  rolePermissions,
  userPermissionGrants,
  userRoleAssignments,
} from '../../db/schema';
import type { AuthenticatedRequest } from './auth.guard';

export const PERMISSION_KEY = 'permission';

/** Restricts a route to callers holding the given permission. Must be paired
 * with AuthGuard (AuthGuard attaches the session PermissionsGuard reads). */
export const RequirePermission = (permission: string) => SetMetadata(PERMISSION_KEY, permission);
export const RequireAnyPermission = (...permissions: string[]) => SetMetadata(PERMISSION_KEY, permissions);

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
  const [roleRows, directRows] = await rlsDb.run(SERVICE_CTX, async (db) => {
    // RlsDb deliberately pins one pg client for the whole callback. Keep
    // queries sequential: node-postgres does not support concurrent queries
    // on one client and will reject this pattern in pg 9.
    const roleRows = await db
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
        );
    const directRows = await db
        .select({
          permissionKey: permissions.key,
          requiresStepUp: permissions.requiresStepUp,
          scopeType: userPermissionGrants.scopeType,
          scopeId: userPermissionGrants.scopeId,
        })
        .from(userPermissionGrants)
        .innerJoin(permissions, eq(permissions.id, userPermissionGrants.permissionId))
        .where(
          and(
            eq(userPermissionGrants.userId, userId),
            isNull(userPermissionGrants.revokedAt),
            sql`${userPermissionGrants.validFrom} <= now()`,
            or(isNull(userPermissionGrants.validUntil), sql`${userPermissionGrants.validUntil} > now()`),
          ),
        );
    return [roleRows, directRows] as const;
  });
  const rows = [...roleRows, ...directRows];

  const assignments = new Map<string, RoleAssignment>();
  for (const row of rows) {
    assignments.set(`${row.scopeType}:${row.scopeId ?? ''}`, {
      scopeType: row.scopeType,
      scopeId: row.scopeId,
    });
  }

  return {
    permissions: new Set(rows.map((r) => r.permissionKey)),
    stepUpRequired: new Set(rows.filter((r) => r.requiresStepUp).map((r) => r.permissionKey)),
    assignments: [...assignments.values()],
  };
}

/** True if an assignment covers the target scope. Scope kinds never bleed
 * into one another: catchment:all does not imply access to every property. */
export function hasCoveringScope(
  assignments: RoleAssignment[],
  targetScopeType: string,
  targetScopeId: string | null,
): boolean {
  return assignments.some((a) => {
    if (a.scopeType === 'platform_wide') return true;
    if (targetScopeType === 'platform_wide') return false;
    if (a.scopeType !== targetScopeType) return false;
    if (targetScopeType === 'catchment' && a.scopeId === 'all') return true;
    return a.scopeId === targetScopeId;
  });
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rlsDb: RlsDb,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string | string[] | undefined>(PERMISSION_KEY, [
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

    const alternatives = Array.isArray(required) ? required : [required];
    const matched = alternatives.find((permission) => granted.has(permission));
    if (!matched) {
      return false;
    }
    if (stepUpRequired.has(matched)) {
      // A freshly authenticated session is the MVP step-up boundary. Older
      // sessions must sign in again before a sensitive mutation can proceed.
      // This remains fail-closed and can be upgraded to MFA without changing
      // controller contracts.
      const signedInAt = new Date(req.session.session.createdAt).getTime();
      if (!Number.isFinite(signedInAt) || Date.now() - signedInAt > 30 * 60_000) {
        throw new UnauthorizedException(`${matched} requires a fresh sign-in`);
      }
    }
    return true;
  }
}
