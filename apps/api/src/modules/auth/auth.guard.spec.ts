import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';

import { AuthGuard } from './auth.guard';
import { SESSION_COOKIE_NAME, type SessionData, type SessionStore } from './session.store';

function context(cookieHeader?: string): ExecutionContext {
  const req = { headers: cookieHeader ? { cookie: cookieHeader } : {} };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

const activeSession: SessionData = {
  user: { id: 'u1', role: 'student', status: 'active', name: 'Amina', email: null, phone: '+256700000001' },
  session: { id: 's1', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() },
};

describe('AuthGuard', () => {
  it('rejects a request with no session cookie', async () => {
    const find = jest.fn();
    const guard = new AuthGuard({ find } as unknown as SessionStore);
    await expect(guard.canActivate(context())).rejects.toThrow(UnauthorizedException);
    expect(find).not.toHaveBeenCalled();
  });

  it('rejects a cookie whose token has no matching session', async () => {
    const find = jest.fn().mockResolvedValue(null);
    const guard = new AuthGuard({ find } as unknown as SessionStore);
    await expect(guard.canActivate(context(`${SESSION_COOKIE_NAME}=deadtoken`))).rejects.toThrow(UnauthorizedException);
    expect(find).toHaveBeenCalledWith('deadtoken');
  });

  it('rejects a valid session belonging to a non-active user', async () => {
    const find = jest.fn().mockResolvedValue({ ...activeSession, user: { ...activeSession.user, status: 'suspended' } });
    const guard = new AuthGuard({ find } as unknown as SessionStore);
    await expect(guard.canActivate(context(`${SESSION_COOKIE_NAME}=t`))).rejects.toThrow('This account is not active');
  });

  it('attaches the session to the request and allows an active user through', async () => {
    const find = jest.fn().mockResolvedValue(activeSession);
    const guard = new AuthGuard({ find } as unknown as SessionStore);
    const req: { session?: SessionData; headers: Record<string, string> } = {
      headers: { cookie: `${SESSION_COOKIE_NAME}=goodtoken` },
    };
    const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.session).toEqual(activeSession);
  });
});
