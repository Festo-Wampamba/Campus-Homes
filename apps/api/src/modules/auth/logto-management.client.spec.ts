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

  describe('addToStaffMfaOrganization', () => {
    const token = () => new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }));

    it('adds the user to the existing MFA-required staff organization', async () => {
      const fetcher = jest.spyOn(global, 'fetch')
        .mockResolvedValueOnce(token())
        .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'org-1', name: 'CampusHomes Staff', isMfaRequired: true }])))
        .mockResolvedValueOnce(new Response(null, { status: 201 }));
      await client().addToStaffMfaOrganization('user-1');
      expect(fetcher.mock.calls[2]).toEqual([
        'https://auth.example.test/api/organizations/org-1/users',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ userIds: ['user-1'] }) }),
      ]);
    });

    it('creates the organization with MFA required when it does not exist yet', async () => {
      const fetcher = jest.spyOn(global, 'fetch')
        .mockResolvedValueOnce(token())
        .mockResolvedValueOnce(new Response(JSON.stringify([])))
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'org-2' })))
        .mockResolvedValueOnce(new Response(null, { status: 201 }));
      await client().addToStaffMfaOrganization('user-1');
      expect(JSON.parse(fetcher.mock.calls[2]![1]!.body as string)).toMatchObject({ name: 'CampusHomes Staff', isMfaRequired: true });
    });

    it('turns MFA back on for an existing staff organization that has it off', async () => {
      const fetcher = jest.spyOn(global, 'fetch')
        .mockResolvedValueOnce(token())
        .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'org-1', name: 'CampusHomes Staff', isMfaRequired: false }])))
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'org-1', isMfaRequired: true })))
        .mockResolvedValueOnce(new Response(null, { status: 201 }));
      await client().addToStaffMfaOrganization('user-1');
      expect(fetcher.mock.calls[2]).toEqual([
        'https://auth.example.test/api/organizations/org-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ isMfaRequired: true }) }),
      ]);
    });

    it('removes a former staff member from the organization', async () => {
      const fetcher = jest.spyOn(global, 'fetch')
        .mockResolvedValueOnce(token())
        .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'org-1', name: 'CampusHomes Staff', isMfaRequired: true }])))
        .mockResolvedValueOnce(new Response(null, { status: 204 }));
      await client().removeFromStaffMfaOrganization('user-1');
      expect(fetcher.mock.calls[2]).toEqual([
        'https://auth.example.test/api/organizations/org-1/users/user-1',
        expect.objectContaining({ method: 'DELETE' }),
      ]);
    });

    it('treats removing a non-member as success', async () => {
      jest.spyOn(global, 'fetch')
        .mockResolvedValueOnce(token())
        .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'org-1', name: 'CampusHomes Staff', isMfaRequired: true }])))
        .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'entity.not_found' }), { status: 404 }));
      await expect(client().removeFromStaffMfaOrganization('user-1')).resolves.toBeUndefined();
    });

    it('lists every organization member across pages', async () => {
      jest.spyOn(global, 'fetch')
        .mockResolvedValueOnce(token())
        .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'org-1', name: 'CampusHomes Staff', isMfaRequired: true }])))
        .mockResolvedValueOnce(new Response(JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ id: `u${i}` })))))
        .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'u100' }])));
      expect(await client().listStaffMfaOrganizationMembers()).toHaveLength(101);
    });

    it('treats an already-member response as success', async () => {
      jest.spyOn(global, 'fetch')
        .mockResolvedValueOnce(token())
        .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'org-1', name: 'CampusHomes Staff', isMfaRequired: true }])))
        .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'entity.unique_integrity_violation' }), { status: 422 }));
      await expect(client().addToStaffMfaOrganization('user-1')).resolves.toBeUndefined();
    });
  });

  describe('updateUserDetails', () => {
    function calls() {
      const fetcher = jest.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 })))
        .mockImplementation(async () => new Response(JSON.stringify({})));
      return fetcher;
    }
    const details = {
      name: 'Jane Doe',
      profile: { gender: 'female', birthdate: '2004-02-01' },
      customData: { contactPhone: '+256772000501' },
    };

    it('patches the display name on the user', async () => {
      const fetcher = calls();
      await client().updateUserDetails('user-1', details);
      expect(fetcher.mock.calls[1]).toEqual([
        'https://auth.example.test/api/users/user-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Jane Doe' }) }),
      ]);
    });

    it('merges profile fields through the partial profile endpoint', async () => {
      const fetcher = calls();
      await client().updateUserDetails('user-1', details);
      expect(fetcher.mock.calls[2]).toEqual([
        'https://auth.example.test/api/users/user-1/profile',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ profile: details.profile }) }),
      ]);
    });

    it('merges contact details into custom data', async () => {
      const fetcher = calls();
      await client().updateUserDetails('user-1', details);
      expect(fetcher.mock.calls[3]).toEqual([
        'https://auth.example.test/api/users/user-1/custom-data',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ customData: details.customData }) }),
      ]);
    });
  });

  it('marks a student as having skipped the MFA prompt', async () => {
    const fetcher = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ mfa: { skipped: true } })));
    await client().skipMfaPrompt('user-1');
    expect(fetcher.mock.calls[1]).toEqual([
      'https://auth.example.test/api/users/user-1/logto-configs',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ mfa: { skipped: true } }) }),
    ]);
  });
});
