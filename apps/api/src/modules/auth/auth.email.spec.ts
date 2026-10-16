import { sendAuthEmail, sendVerificationCodeEmail, verificationContent } from './auth.email';
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

describe('sendVerificationCodeEmail without a provider', () => {
  it('prints the code in development so local sign-in can complete', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    await sendVerificationCodeEmail({ ...baseEnv, NODE_ENV: 'development' }, { to: 'dev@example.com', code: '482913', kind: 'sign-in' });
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/To dev@example\.com: .*482913/));
    info.mockRestore();
  });

  it('never prints the code outside development', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    await sendVerificationCodeEmail(baseEnv, { to: 'dev@example.com', code: '482913', kind: 'sign-in' });
    expect(info.mock.calls.flat().join(' ')).not.toContain('482913');
    info.mockRestore();
  });
});

describe('verificationContent', () => {
  // 09:00 UTC is 12:00 in Kampala (EAT, UTC+3).
  const issuedAt = new Date('2026-10-16T09:00:00Z');

  it('puts the code in the subject so it shows in the notification', () => {
    expect(verificationContent('sign-in', '641334', issuedAt).subject).toBe('Your CampusHomes sign-in code: 641334');
  });

  it('tells the reader when the code expires, in Kampala time', () => {
    expect(verificationContent('sign-in', '641334', issuedAt).text).toContain(
      'This code expires in 10 minutes, at 12:10 pm EAT.',
    );
  });

  it('says a new code cancels this one', () => {
    expect(verificationContent('register', '641334', issuedAt).text).toContain('Requesting a new code cancels this one');
  });

  it('shows each digit in its own box', () => {
    const { html } = verificationContent('sign-in', '641334', issuedAt);
    expect(html.match(/border:2px solid #087f80/g)).toHaveLength(6);
  });

  it('keeps the whole code on one copyable line', () => {
    expect(verificationContent('forgot-password', '641334', issuedAt).html).toContain('user-select:all">641334</span>');
  });
});
