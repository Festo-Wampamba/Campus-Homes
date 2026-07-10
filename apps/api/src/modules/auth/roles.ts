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

export const ROLES_KEY = 'roles';

/** Restricts a route to the given roles. Must be paired with AuthGuard
 * (AuthGuard attaches the session RolesGuard reads). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** The caller's RLS identity, derived from the Better Auth session only —
 * never from anything client-supplied. */
export function rlsCtx(req: AuthenticatedRequest): RlsContext {
  return { userId: req.session.user.id, role: req.session.user.role as UserRole };
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) {
      return true;
    }
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return required.includes(req.session.user.role as UserRole);
  }
}
