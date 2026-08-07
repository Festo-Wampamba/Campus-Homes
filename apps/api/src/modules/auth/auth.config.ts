import crypto from 'node:crypto';

import { dash } from '@better-auth/infra';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { phoneNumber } from 'better-auth/plugins';

import type { MessagingAdapter } from '../../adapters/messaging.adapter';
import type { Env } from '../../config/env';
import type { Db } from '../../db/client';
import { accounts, sessions, users, verifications } from '../../db/schema';

/**
 * Better Auth instance factory (brief §6 AuthModule):
 * - phone-OTP sign-in/sign-up for students & landlords
 * - email/password for Ops/Admin — sign-up disabled, those users are seeded
 *   through service paths only
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
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL ?? `http://localhost:${env.PORT}`,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    // The web app posts auth requests cross-origin (Vercel ↔ Render in prod,
    // :3000 ↔ :4000 locally) — Better Auth rejects them without this.
    trustedOrigins: [env.WEB_ORIGIN],
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
    emailAndPassword: { enabled: true, disableSignUp: true },
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
