import { betterAuth } from 'better-auth';

import { loadEnv } from '../../config/env';
import type { Db } from '../../db/client';
import type { MessagingAdapter } from '../../adapters/messaging.adapter';
import { createAuth } from './auth.config';

jest.mock('better-auth', () => ({
  betterAuth: jest.fn((options) => ({ options })),
}));
jest.mock('@better-auth/infra', () => ({ dash: jest.fn() }));
jest.mock('better-auth/adapters/drizzle', () => ({ drizzleAdapter: jest.fn(() => ({})) }));
jest.mock('better-auth/plugins', () => ({ phoneNumber: jest.fn(() => ({})) }));

const db = {} as Db;
const messaging = { sendSms: jest.fn() } as unknown as MessagingAdapter;

describe('createAuth cookie scope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shares secure session cookies with the configured frontend subdomain', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgresql://localhost/test',
      BETTER_AUTH_SECRET: 'x'.repeat(32),
      BETTER_AUTH_URL: 'https://api-staging.campushomes.co.ug',
      WEB_ORIGIN: 'https://staging.campushomes.co.ug',
      AUTH_COOKIE_DOMAIN: '.campushomes.co.ug',
    });

    createAuth(env, db, messaging);

    expect(jest.mocked(betterAuth)).toHaveBeenCalledWith(
      expect.objectContaining({
        advanced: expect.objectContaining({
          cookiePrefix: 'campushomes-auth-v2',
          useSecureCookies: true,
          crossSubDomainCookies: {
            enabled: true,
            domain: '.campushomes.co.ug',
          },
        }),
      }),
    );
  });

  it('keeps cookies host-only when no shared domain is configured', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgresql://localhost/test',
      BETTER_AUTH_SECRET: 'x'.repeat(32),
      BETTER_AUTH_URL: 'http://localhost:4000',
      WEB_ORIGIN: 'http://localhost:3000',
    });

    createAuth(env, db, messaging);

    expect(jest.mocked(betterAuth)).toHaveBeenCalledWith(
      expect.objectContaining({
        advanced: {
          database: expect.objectContaining({ generateId: expect.any(Function) }),
        },
      }),
    );
  });

  it('enables student Google sign-in and transactional email hooks when configured', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgresql://localhost/test',
      BETTER_AUTH_SECRET: 'x'.repeat(32),
      BETTER_AUTH_URL: 'https://api-staging.campushomes.co.ug',
      WEB_ORIGIN: 'https://staging.campushomes.co.ug',
      GOOGLE_CLIENT_ID: 'google-client-id',
      GOOGLE_CLIENT_SECRET: 'google-client-secret',
      RESEND_API_KEY: 're_test_key',
      AUTH_EMAIL_FROM: 'CampusHomes <auth@example.com>',
      AUTH_APP_URL: 'https://staging.campushomes.co.ug',
    });

    createAuth(env, db, messaging);

    const options = jest.mocked(betterAuth).mock.calls.at(-1)?.[0] as unknown as {
      socialProviders: { google: Record<string, unknown> };
      account: { accountLinking: Record<string, unknown> };
      emailAndPassword: Record<string, unknown>;
      emailVerification: Record<string, unknown>;
    };
    expect(options.socialProviders.google).toEqual(expect.objectContaining({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
      prompt: 'select_account',
    }));
    expect(options.account.accountLinking).toEqual(expect.objectContaining({
      enabled: true,
      trustedProviders: ['google'],
      disableImplicitLinking: true,
    }));
    expect(options.emailAndPassword).toEqual(expect.objectContaining({
      requireEmailVerification: true,
      sendResetPassword: expect.any(Function),
    }));
    expect(options.emailVerification).toEqual(expect.objectContaining({
      sendOnSignUp: true,
      sendVerificationEmail: expect.any(Function),
    }));
  });
});
