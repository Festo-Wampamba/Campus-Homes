import crypto from 'node:crypto';

import { dash } from '@better-auth/infra';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { phoneNumber } from 'better-auth/plugins';

import type { MessagingAdapter } from '../../adapters/messaging.adapter';
import type { Env } from '../../config/env';
import type { Db } from '../../db/client';
import { assertStubAllowed } from '../../config/integration-guard';
import { sendAuthEmail } from './auth.email';
import { accounts, sessions, users, verifications } from '../../db/schema';

/**
 * Better Auth instance factory (brief §6 AuthModule):
 * - One clean sign-in page, no role picker: self-serve sign-up (phone-OTP
 *   or email/password) always creates a `student` (additionalFields
 *   default below) — there is no self-serve path to any other role.
 * - Landlord/Ops/Admin/Finance accounts are admin-provisioned only (admin
 *   console "Add user"); they sign in through the same email/password
 *   flow, and the app routes them by whatever role their session actually
 *   carries — never by anything the client asserts at sign-in time.
 * - sessions persisted in NeonDB (`sessions` table)
 *
 * `db` must be the dedicated service-context pool (see AuthModule): every
 * Better Auth query is pre-auth identity bootstrapping and runs under the
 * `service_role` RLS context, never a client-derived identity.
 */
export function createAuth(env: Env, db: Db, messaging: MessagingAdapter) {
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error('AuthModule requires BETTER_AUTH_SECRET');
  }
  const hasGoogle = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  if (!hasGoogle && env.NODE_ENV === 'production') {
    assertStubAllowed(env, 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET', 'AuthModule');
  }
  if (!env.RESEND_API_KEY && env.NODE_ENV === 'production') {
    assertStubAllowed(env, 'RESEND_API_KEY', 'AuthModule');
  }
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL ?? `http://localhost:${env.PORT}`,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    // The web app posts auth requests cross-origin (Vercel ↔ Render in prod,
    // :3000 ↔ :4000 locally) — Better Auth rejects them without this.
    trustedOrigins: [...new Set([env.WEB_ORIGIN, env.AUTH_APP_URL])],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    // Better Auth's default ids are not UUIDs; our columns are uuid.
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
      ...(env.AUTH_COOKIE_DOMAIN
        ? {
            // The API sets the session cookie, but Next.js layout guards run
            // on the sibling web host and must receive that same cookie.
            // Secure cookies keep this production-only scope HTTPS-bound.
            // Version the deployed cookie namespace so host-only cookies from
            // releases before cross-subdomain sharing can never shadow the
            // current session. Bump this only for an intentional auth reset.
            cookiePrefix: 'campushomes-auth-v2',
            useSecureCookies: true,
            crossSubDomainCookies: {
              enabled: true,
              domain: env.AUTH_COOKIE_DOMAIN,
            },
          }
        : {}),
    },
    user: {
      additionalFields: {
        // input: false — clients can never set their own role/status; the
        // users table has no self-UPDATE policy either (defense in depth).
        role: { type: 'string', required: false, defaultValue: 'student', input: false },
        status: { type: 'string', required: false, defaultValue: 'pending', input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: false,
      // MVP-phase relaxation: verification-gated sign-up depends on RESEND
      // being configured and delivering in every test environment, which
      // isn't guaranteed during moderated testing — a student who never
      // receives (or can't access) the email would be stuck unable to sign
      // in at all. Revisit before a real production launch.
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url }) => {
        await sendAuthEmail(env, { to: user.email, name: user.name, url, kind: 'reset-password' });
      },
    },
    emailVerification: {
      sendOnSignUp: false,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendAuthEmail(env, { to: user.email, name: user.name, url, kind: 'verify-email' });
      },
    },
    ...(hasGoogle
      ? {
          socialProviders: {
            google: {
              clientId: env.GOOGLE_CLIENT_ID!,
              clientSecret: env.GOOGLE_CLIENT_SECRET!,
              prompt: 'select_account',
            },
          },
          account: {
            accountLinking: {
              enabled: true,
              trustedProviders: ['google'],
              disableImplicitLinking: true,
            },
          },
        }
      : {}),
    plugins: [
      phoneNumber({
        sendOTP: async ({ phoneNumber: phone, code }) => {
          await messaging.sendSms(phone, `Your CampusHomes verification code is ${code}`);
        },
        signUpOnVerification: {
          // users.email is UNIQUE NOT NULL for Better Auth; phone signups get
          // a deterministic placeholder derived from the (unique) phone.
          getTempEmail: (phone) => `${phone.replace(/\D/g, '')}@phone.campushomes.ug`,
        },
        schema: {
          user: { fields: { phoneNumber: 'phone', phoneNumberVerified: 'phoneVerified' } },
        },
      }),
      ...(env.BETTER_AUTH_API_KEY ? [dash()] : []),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
