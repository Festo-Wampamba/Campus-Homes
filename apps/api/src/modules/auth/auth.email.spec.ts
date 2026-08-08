import { sendAuthEmail } from './auth.email';
import type { Env } from '../../config/env';

const baseEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://localhost/test',
  DEV_REDIS_URL: 'redis://localhost:6379',
  AUTH_EMAIL_FROM: 'CampusHomes <auth@example.com>',
  AUTH_APP_URL: 'http://localhost:3000',
} as Env;

describe('sendAuthEmail', () => {
  it('uses the Resend API payload when configured', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));
    await sendAuthEmail({ ...baseEnv, RESEND_API_KEY: 're_test_key' }, {
      to: 'student@example.com',
      name: 'Amina Nambasa',
      url: 'http://localhost:3000/auth/callback?token=abc',
      kind: 'verify-email',
    });
    expect(fetchMock).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer re_test_key' }),
    }));
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual(expect.objectContaining({
      to: ['student@example.com'],
      from: 'CampusHomes <auth@example.com>',
    }));
    fetchMock.mockRestore();
  });

  it('does not make a network call without a provider key in test/dev mode', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    await sendAuthEmail(baseEnv, {
      to: 'student@example.com',
      name: 'Amina Nambasa',
      url: 'http://localhost:3000/reset-password?token=abc',
      kind: 'reset-password',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
