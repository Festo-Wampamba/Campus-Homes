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
import { effectiveRoles } from './access-resolver';

export const PERMISSION_KEY = 'permission';

// Step-up-gated permissions (delete, role/permission changes, deactivation)
// require the session's original sign-in to be within this window — a hijacked
// or long-idle session cannot perform them without a fresh, MFA-verified login.
// Sized to cover a normal admin work session (was 30m, too short to be usable);
// step-up is kept ON for every sensitive action rather than removed.
export const STEP_UP_MAX_AGE_MS = 8 * 60 * 60 * 1000;

/** Restricts a route to callers holding the given permission. Must be paired
 * with AuthGuard (AuthGuard attaches the session PermissionsGuard reads). */
export const RequirePermission = (permission: string) => SetMetadata(PERMISSION_KEY, permission);
export const RequireAnyPermission = (...permissions: string[]) => SetMetadata(PERMISSION_KEY, permissions);

export interface RoleAssignment {
  scopeType: string;
  scopeId: string | null;
}

export interface PermissionGrant extends RoleAssignment {
  permissionKey: string;
  requiresStepUp: boolean;
}

export interface LoadedPermissions {
  permissions: Set<string>;
  stepUpRequired: Set<string>;
  assignments: RoleAssignment[];
  grants: PermissionGrant[];
}

/** Scope-aware consumers must name the permission whose scope they enforce. */
export function assignmentsForPermission(grants: PermissionGrant[], permission: string): RoleAssignment[] {
  return grants.filter((grant) => grant.permissionKey === permission)
    .map(({ scopeType, scopeId }) => ({ scopeType, scopeId }));
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
  permission?: string,
): Promise<LoadedPermissions> {
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
  const grants = [...roleRows, ...directRows].filter((row) =>
    (row.scopeType === 'platform_wide' && row.scopeId === null) ||
    (row.scopeType === 'property' && row.scopeId !== null) ||
    (row.scopeType === 'catchment' && row.scopeId !== null));
  // Legacy consumers use this set to run unrestricted service-role queries.
  // Only explicitly permission-scoped callers may receive narrower grants.
  const rows = grants.filter((row) => permission
    ? row.permissionKey === permission
    : row.scopeType === 'platform_wide' && row.scopeId === null);

  const assignments = new Map<string, RoleAssignment>();
  for (const row of rows) {
    assignments.set(`${row.scopeType}:${row.scopeId ?? ''}`, {
      scopeType: row.scopeType,
      scopeId: row.scopeId,
    });
  }

  return {
    grants,
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
    if (a.scopeType === 'platform_wide') return a.scopeId === null;
    if (targetScopeType === 'platform_wide') return false;
    if (a.scopeType !== targetScopeType) return false;
    if (targetScopeType === 'catchment' && a.scopeId === 'all') return true;
    return a.scopeId !== null && a.scopeId === targetScopeId;
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
    req.assignments = [];
    req.permissions = new Set();
    const staffRole = effectiveRoles(req.session.access.roles)
      .find((role) => ['admin', 'ops_lead', 'ops_inspector'].includes(role));
    if (!staffRole || !req.session.access.assurance.mfaVerified) return false;
    const { permissions: granted, grants } = await loadPermissions(
      this.rlsDb,
      req.session.user.id,
    );
    const alternatives = Array.isArray(required) ? required : [required];
    // These existing service methods enforce req.assignments against each
    // mutation target. Other staff endpoints perform unrestricted service-role
    // queries, so scoped grants must fail closed until those callers are scoped.
    const scopeAware = new Set(['roles.assign', 'roles.revoke', 'staff.invite',
      'staff.deactivate', 'users.permissions_manage']);
    const matched = alternatives.find((permission) => granted.has(permission) ||
      (scopeAware.has(permission) && grants.some((grant) => grant.permissionKey === permission)));
    if (!matched) {
      return false;
    }
    if (grants.some((grant) => grant.permissionKey === matched && grant.requiresStepUp)) {
      const signedInAt = Date.parse(req.session.access.assurance.authenticatedAt ?? '');
      if (!Number.isFinite(signedInAt) || signedInAt > Date.now() || Date.now() - signedInAt > STEP_UP_MAX_AGE_MS) {
        throw new UnauthorizedException(`${matched} requires a fresh sign-in`);
      }
    }
    req.effectiveRole = staffRole;
    req.permissions = new Set([...granted, matched]);
    req.assignments = assignmentsForPermission(grants, matched);
    return true;
  }
}
