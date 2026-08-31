import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { parse } from 'cookie';
import type { Request } from 'express';

import { SESSION_COOKIE_NAME, SessionStore, type SessionData } from './session.store';

export type { SessionData };

export interface AuthenticatedRequest extends Request {
  session: SessionData;
}

export function readSessionCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  return parse(header)[SESSION_COOKIE_NAME];
}

/** Rejects requests without a valid session and attaches it (user + session
 * row) to the request for downstream handlers. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessionStore: SessionStore) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readSessionCookie(req);
    const session = token ? await this.sessionStore.find(token) : null;
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
