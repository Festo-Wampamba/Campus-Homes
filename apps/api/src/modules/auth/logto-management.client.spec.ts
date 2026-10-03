import { LogtoManagementClient } from './logto-management.client';
import type { Env } from '../../config/env';

describe('self-hosted Logto Management API', () => {
  afterEach(() => jest.restoreAllMocks());

  function client() {
    return new LogtoManagementClient({
      LOGTO_ENDPOINT: 'https://auth.example.test', LOGTO_M2M_APP_ID: 'app', LOGTO_M2M_APP_SECRET: 'secret',
    } as Env);
  }

  it('uses the OSS resource indicator independently of the custom domain', async () => {
    const fetcher = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'one-time' })));
    const client = new LogtoManagementClient({
      LOGTO_ENDPOINT: 'https://auth.example.test', LOGTO_M2M_APP_ID: 'app', LOGTO_M2M_APP_SECRET: 'secret',
    } as Env);
    await expect(client.createOneTimeToken('staff@example.test', 'SignIn', 600)).resolves.toEqual({ token: 'one-time' });
    const body = fetcher.mock.calls[0]![1]?.body as URLSearchParams;
    expect(body.get('resource')).toBe('https://default.logto.app/api');
    expect(fetcher.mock.calls[0]![0]).toBe('https://auth.example.test/oidc/token');
  });

  it('reads the tenant-wide sign-in experience through the shared request helper', async () => {
    const fetcher = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ color: { primaryColor: '#008080' } })));

    await expect(client().getSignInExperience()).resolves.toEqual({ color: { primaryColor: '#008080' } });
    expect(fetcher.mock.calls[1]).toEqual([
      'https://auth.example.test/api/sign-in-exp',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token' }) }),
    ]);
  });

  it('patches the tenant-wide sign-in experience through the shared request helper', async () => {
    const patch = { color: { primaryColor: '#008080' }, customCss: '#app { color: #f08080; }' };
    const fetcher = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 })))
      .mockResolvedValueOnce(new Response(JSON.stringify(patch)));

    await expect(client().updateSignInExperience(patch)).resolves.toEqual(patch);
    expect(fetcher.mock.calls[1]).toEqual([
      'https://auth.example.test/api/sign-in-exp',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify(patch) }),
    ]);
  });

  describe('hasMfaFactor', () => {
    function factors(list: Array<{ type: string }>) {
      jest.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 })))
        .mockResolvedValueOnce(new Response(JSON.stringify(list)));
    }

    it('is true when an authenticator factor is enrolled', async () => {
      factors([{ type: 'Totp' }, { type: 'BackupCode' }]);
      await expect(client().hasMfaFactor('user-1')).resolves.toBe(true);
    });

    it('is false for a user who skipped enrolment', async () => {
      factors([]);
      await expect(client().hasMfaFactor('user-1')).resolves.toBe(false);
    });

    it('does not count backup codes alone as a second factor', async () => {
      factors([{ type: 'BackupCode' }]);
      await expect(client().hasMfaFactor('user-1')).resolves.toBe(false);
    });

    it('throws when Logto cannot answer, so the staff callback fails closed', async () => {
      jest.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 })))
        .mockResolvedValueOnce(new Response('nope', { status: 500 }));
      await expect(client().hasMfaFactor('user-1')).rejects.toThrow('HTTP 500');
    });
  });

  it('clears the MFA skip flag so the next sign-in offers setup again', async () => {
    const fetcher = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ mfa: { skipped: false } })));
    await client().resetMfaSkip('user-1');
    expect(fetcher.mock.calls[1]).toEqual([
      'https://auth.example.test/api/users/user-1/logto-configs',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ mfa: { skipped: false } }) }),
    ]);
  });
});
