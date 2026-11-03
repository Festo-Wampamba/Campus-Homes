import { AuthController } from './auth.controller';
import { transactionCookie } from './auth-transactions';

jest.mock('../../config/env', () => ({ loadEnv: () => ({
  DATABASE_URL: 'postgresql://unused/test', WEB_ORIGIN: 'https://staging.example.test',
  NODE_ENV: 'production', LOGTO_MFA_POLICY_VERIFIED: true,
}) }));

const state = 'a'.repeat(43);

function flow(options: { enrolled?: boolean; ready?: boolean; retrySub?: string; sub?: string;
  verified?: boolean; age?: number; portal?: 'staff' | 'consumer' } = {}) {
  const claims = { sub: options.sub ?? 'staff-sub', nonce: 'nonce', email: 'staff@example.test',
    email_verified: options.verified ?? true, auth_time: (Date.now() - (options.age ?? 0)) / 1000 };
  const transaction = { portal: options.portal ?? 'staff', intent: 'staff', next: '/admin/leadership',
    nonce: 'nonce', startedAt: Date.now(), storage: {}, mfaEnrollmentSub: options.retrySub };
  const transactions = { consume: jest.fn().mockResolvedValue(transaction), save: jest.fn() };
  const provisioning = { provision: jest.fn().mockResolvedValue({ id: 'local-id', role: 'admin', status: 'active' }),
    hasActiveStaffRole: jest.fn().mockResolvedValue(true) };
  const session = { create: jest.fn().mockResolvedValue({ token: 'session' }), destroy: jest.fn() };
  const management = { prepareStaffMfa: jest.fn().mockResolvedValue(options.ready ?? true),
    addToStaffMfaOrganization: jest.fn().mockResolvedValue(undefined),
    hasMfaFactor: jest.fn().mockResolvedValue(options.enrolled ?? false),
    resetMfaSkip: jest.fn().mockResolvedValue(undefined),
    createOneTimeToken: jest.fn().mockResolvedValue({ token: 'private-enrollment-token' }) };
  const signIn = jest.fn();
  const clients = { create: jest.fn().mockImplementation(async (_env, _portal, _values, navigate) => ({
    handleSignInCallback: jest.fn(), getIdTokenClaims: async () => claims,
    signIn: async (params: unknown) => { signIn(params); await navigate('https://auth.example.test/oidc/auth'); },
  })) };
  const controller = new AuthController(provisioning as never, session as never, transactions as never,
    clients as never, management as never);
  const res = { redirect: jest.fn(), setHeader: jest.fn(), clearCookie: jest.fn(), cookie: jest.fn() };
  const req = { query: { state }, headers: { cookie: `${transactionCookie(state)}=browser` }, originalUrl: '/callback' };
  return { controller, req, res, session, transactions, management, provisioning, signIn };
}

describe('mandatory staff MFA onboarding', () => {
  it('continues a verified invitation straight into MFA setup without issuing a staff session', async () => {
    const f = flow();
    await f.controller.callback(f.req as never, f.res as never);
    expect(f.session.create).not.toHaveBeenCalled();
    expect(f.management.createOneTimeToken).toHaveBeenCalledWith('staff@example.test', 'SignIn', 300);
    expect(f.transactions.save).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      portal: 'staff', next: '/admin/leadership', mfaEnrollmentSub: 'staff-sub',
    }));
    expect(f.signIn).toHaveBeenCalledWith(expect.objectContaining({
      extraParams: expect.objectContaining({ one_time_token: 'private-enrollment-token', acr_values: 'urn:logto:acr:mfa' }),
    }));
    expect(f.res.redirect).toHaveBeenCalledWith('https://auth.example.test/oidc/auth');
  });

  it('requires another provider authentication if MFA policy was not enforced for this interaction', async () => {
    const f = flow({ enrolled: true, ready: false });
    await f.controller.callback(f.req as never, f.res as never);
    expect(f.session.create).not.toHaveBeenCalled();
    expect(f.management.createOneTimeToken).toHaveBeenCalledTimes(1);
  });

  it('issues a session only after enrolled MFA and the existing policy pass', async () => {
    const f = flow({ enrolled: true, retrySub: 'staff-sub' });
    await f.controller.callback(f.req as never, f.res as never);
    expect(f.session.create).toHaveBeenCalledWith('local-id', undefined, undefined, expect.objectContaining({ mfaVerified: true }));
    expect(f.management.createOneTimeToken).not.toHaveBeenCalled();
  });

  it.each([{ retrySub: 'staff-sub' }, { verified: false }, { age: 120_000 }])(
    'never loops, continues an unverified email, or refreshes stale authentication (%j)', async (options) => {
      const f = flow(options);
      await f.controller.callback(f.req as never, f.res as never);
      expect(f.session.create).not.toHaveBeenCalled();
      expect(f.management.createOneTimeToken).not.toHaveBeenCalled();
      expect(f.res.redirect).toHaveBeenCalledWith(expect.stringContaining('/staff?error=mfa_required'));
    },
  );

  it('rejects an account switch during enrollment before provisioning', async () => {
    const f = flow({ enrolled: true, retrySub: 'other-sub' });
    await f.controller.callback(f.req as never, f.res as never);
    expect(f.provisioning.provision).not.toHaveBeenCalled();
    expect(f.session.create).not.toHaveBeenCalled();
  });

  it('fails closed if the provider cannot enforce staff policy', async () => {
    const f = flow({ enrolled: true });
    f.management.prepareStaffMfa.mockRejectedValue(new Error('provider unavailable'));
    await f.controller.callback(f.req as never, f.res as never);
    expect(f.session.create).not.toHaveBeenCalled();
  });

  it('does not continue an identity without a current staff grant or invitation', async () => {
    const f = flow();
    f.provisioning.provision.mockResolvedValue(null as never);
    await f.controller.callback(f.req as never, f.res as never);
    expect(f.management.createOneTimeToken).not.toHaveBeenCalled();
    expect(f.session.create).not.toHaveBeenCalled();
  });

  it('fails closed if the short-lived enrollment token cannot be created', async () => {
    const f = flow();
    f.management.createOneTimeToken.mockRejectedValue(new Error('provider unavailable'));
    await f.controller.callback(f.req as never, f.res as never);
    expect(f.session.create).not.toHaveBeenCalled();
    expect(f.signIn).not.toHaveBeenCalled();
  });

  it('does not start staff enrollment for consumers', async () => {
    const f = flow({ portal: 'consumer' });
    await f.controller.callback(f.req as never, f.res as never);
    expect(f.management.prepareStaffMfa).not.toHaveBeenCalled();
    expect(f.management.createOneTimeToken).not.toHaveBeenCalled();
    expect(f.session.create).toHaveBeenCalledWith('local-id', undefined, undefined, expect.objectContaining({ mfaVerified: false }));
  });
});
