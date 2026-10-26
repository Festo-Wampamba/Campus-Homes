import type { Env } from '../config/env';
import { escapeHtml, sendNotificationEmail } from './notification-email';

const fakeResendKey = 'not-a-real-key';
const env = {
  NODE_ENV: 'test',
  AUTH_EMAIL_FROM: 'CampusHomes <hello@example.com>',
  AUTH_APP_URL: 'http://localhost:3000',
  RESEND_API_KEY: fakeResendKey,
} as Env;

afterEach(() => jest.restoreAllMocks());

describe('escapeHtml', () => {
  it('escapes markup and both quote styles', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });
});

describe('sendNotificationEmail', () => {
  it('names the email kind and status when Resend refuses it', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 422 }));

    await expect(
      sendNotificationEmail(env, { to: ['a@example.com'], subject: 'Hi', html: '<p>Hi</p>', kind: 'payment receipt' }),
    ).rejects.toThrow('Resend rejected payment receipt email with status 422');
  });
});
