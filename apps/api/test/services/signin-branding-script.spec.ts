/* eslint-disable @typescript-eslint/no-require-imports */
const {
  CUSTOM_CSS,
  applySignInBranding,
  buildBrandingPatch,
  readOptions,
} = require('../../scripts/set-signin-branding.cjs') as {
  CUSTOM_CSS: string;
  applySignInBranding: (options: Record<string, unknown>, fetcher: jest.Mock) => Promise<Record<string, unknown>>;
  buildBrandingPatch: (origin: string) => Record<string, unknown>;
  readOptions: (env: Record<string, string>, argv: string[]) => Record<string, unknown>;
};

const baseEnv = {
  LOGTO_ENDPOINT: 'https://auth-staging.example.test',
  WEB_ORIGIN: 'https://staging.example.test',
  BRANDING_TARGET: 'staging',
  LOGTO_M2M_APP_ID: 'app',
  LOGTO_M2M_APP_SECRET: 'secret',
};

describe('Logto sign-in branding script', () => {
  it('builds the teal/coral, Poppins and CampusHomes logo treatment', () => {
    expect(buildBrandingPatch('https://staging.example.test')).toEqual(expect.objectContaining({
      color: expect.objectContaining({ primaryColor: '#008080' }),
      branding: expect.objectContaining({
        logoUrl: 'https://staging.example.test/images/branding/campushomes-mark.png',
      }),
    }));
    expect(CUSTOM_CSS).toContain('Poppins');
    expect(CUSTOM_CSS).toContain('240, 128, 128');
  });

  it('refuses an environment label that does not match its hosts', () => {
    expect(() => readOptions({ ...baseEnv, BRANDING_TARGET: 'production' }, [])).toThrow(
      'does not match LOGTO_ENDPOINT and WEB_ORIGIN',
    );
  });

  it('requires an extra production latch before applying', () => {
    expect(() => readOptions({
      ...baseEnv,
      LOGTO_ENDPOINT: 'https://auth.example.test',
      WEB_ORIGIN: 'https://example.test',
      BRANDING_TARGET: 'production',
    }, ['--apply'])).toThrow('ALLOW_PRODUCTION_SIGNIN_BRANDING=true');
  });

  it('is read-only unless --apply was supplied', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ color: { primaryColor: '#000000' } })));
    const result = await applySignInBranding(readOptions(baseEnv, []), fetcher);
    expect(result).toEqual(expect.objectContaining({ dryRun: true, previousPrimaryColor: '#000000' }));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('patches only after explicit apply', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ color: { primaryColor: '#000000' } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ color: { primaryColor: '#008080' } })));
    const options = readOptions(baseEnv, ['--apply']);
    await expect(applySignInBranding(options, fetcher)).resolves.toEqual(expect.objectContaining({ dryRun: false }));
    expect(fetcher.mock.calls[2][1]).toEqual(expect.objectContaining({ method: 'PATCH' }));
  });
});
