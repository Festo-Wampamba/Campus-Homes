import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { UserRole } from '@campushomes/shared';

import type { RlsContext } from '../../db/rls-context';
import { RlsDb } from '../../db/db.module';
import { landlords } from '../../db/schema';
import { eq } from 'drizzle-orm';
import type { AuthenticatedRequest } from './auth.guard';
import { effectiveRoles } from './access-resolver';

export const ROLES_KEY = 'roles';
export const ALLOW_PENDING_LANDLORD_KEY = 'allow-pending-landlord';

/** Restricts a route to the given roles. Must be paired with AuthGuard
 * (AuthGuard attaches the session RolesGuard reads). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** The two onboarding writes and their reads are the only landlord actions
 * available before a reviewer accepts the submitted application. */
export const AllowPendingLandlord = () => SetMetadata(ALLOW_PENDING_LANDLORD_KEY, true);

/** Personal endpoints default to the least privileged identity. Staff identity
 * is available only after a route guard validates an active role and MFA. */
export function rlsCtx(req: AuthenticatedRequest): RlsContext {
  const role = req.effectiveRole;
  const valid = role && effectiveRoles(req.session.access.roles).includes(role);
  const staff = role === 'admin' || role === 'ops_lead' || role === 'ops_inspector';
  return {
    userId: req.session.user.id,
    role: valid && (!staff || req.session.access.assurance.mfaVerified) ? role : 'student',
    mfaVerified: req.session.access.assurance.mfaVerified,
  };
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rlsDb?: RlsDb,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    req.effectiveRole = undefined;
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) {
      return true;
    }
    const available = effectiveRoles(req.session.access.roles);
    const matched = required.find((role) => available.includes(role) &&
      // `admin` is a legacy database/RLS role shared by every admin-console
      // persona. Broad @Roles('admin') routes are full-platform routes, so
      // only the two platform-administrator assignments may satisfy them.
      // Finance, support, and audit use PermissionsGuard endpoints instead.
      (role !== 'admin' || req.session.access.roles.some((key) =>
        key === 'super_admin' || key === 'platform_admin')) &&
      (!['ops_inspector', 'ops_lead', 'admin'].includes(role) || req.session.access.assurance.mfaVerified));
    if (!matched) return false;
    const allowPendingLandlord = this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_PENDING_LANDLORD_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (matched === 'landlord' && !allowPendingLandlord && this.rlsDb) {
      return this.rlsDb.run(
        { userId: req.session.user.id, role: 'service_role' },
        (db) => db.query.landlords.findFirst({ where: eq(landlords.userId, req.session.user.id) }),
      ).then((profile) => {
        if (!profile || profile.kycStatus !== 'verified') {
          throw new ForbiddenException('Landlord access is pending CampusHomes approval');
        }
        req.effectiveRole = matched;
        return true;
      });
    }
    req.effectiveRole = matched;
    return true;
  }
}
