import { LogtoManagementClient } from './logto-management.client';
import type { Env } from '../../config/env';

describe('self-hosted Logto Management API', () => {
  afterEach(() => jest.restoreAllMocks());
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
});
