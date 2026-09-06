import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { UserRole } from '@campushomes/shared';

import type { RlsContext } from '../../db/rls-context';
import type { AuthenticatedRequest } from './auth.guard';
import { effectiveRoles } from './access-resolver';

export const ROLES_KEY = 'roles';

/** Restricts a route to the given roles. Must be paired with AuthGuard
 * (AuthGuard attaches the session RolesGuard reads). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

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
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
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
      (!['ops_inspector', 'ops_lead', 'admin'].includes(role) || req.session.access.assurance.mfaVerified));
    if (!matched) return false;
    req.effectiveRole = matched;
    return true;
  }
}
