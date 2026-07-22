import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';

import type { Auth } from './auth.config';
import { AUTH } from './auth.tokens';

export type SessionData = Auth['$Infer']['Session'];

export interface AuthenticatedRequest extends Request {
  session: SessionData;
}

/** Rejects requests without a valid Better Auth session and attaches the
 * session (user + session row) to the request for downstream handlers. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) {
      throw new UnauthorizedException();
    }
    if (session.user.status !== 'active') {
      throw new UnauthorizedException('This account is not active');
    }
    req.session = session;
    return true;
  }
}
