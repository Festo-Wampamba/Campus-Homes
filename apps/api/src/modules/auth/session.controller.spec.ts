import { SessionController } from './auth.controller';
import type { SessionStore } from './session.store';

function response() {
  return { json: jest.fn(), setHeader: jest.fn() } as unknown as { json: jest.Mock; setHeader: jest.Mock };
}

describe('SessionController', () => {
  it('sends a real JSON null when no session cookie is present', async () => {
    const controller = new SessionController({ find: jest.fn() } as unknown as SessionStore);
    const res = response();

    await controller.session({ headers: {} } as never, res as never);

    expect(res.json).toHaveBeenCalledWith(null);
  });

  it('sends a real JSON null when the cookie names an unknown or expired session', async () => {
    const find = jest.fn().mockResolvedValue(null);
    const controller = new SessionController({ find } as unknown as SessionStore);
    const res = response();

    await controller.session({ headers: { cookie: 'campushomes-session-v1=stale-token' } } as never, res as never);

    expect(res.json).toHaveBeenCalledWith(null);
  });

  it('sends the resolved session as JSON for a valid cookie', async () => {
    const session = { user: { id: 'u1' }, access: { workspaces: ['student'] } };
    const find = jest.fn().mockResolvedValue(session);
    const controller = new SessionController({ find } as unknown as SessionStore);
    const res = response();

    await controller.session({ headers: { cookie: 'campushomes-session-v1=real-token' } } as never, res as never);

    expect(res.json).toHaveBeenCalledWith(session);
  });
});
