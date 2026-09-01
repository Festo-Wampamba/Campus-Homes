import { z } from 'zod';

// Every secret comes from the environment. Fail fast at boot if anything
// required is missing — never limp along with a partial config.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).optional(),
  // Local development uses an isolated Redis with BullMQ's required
  // no-eviction policy, even when REDIS_URL points at a managed deployment.
  DEV_REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  // Logto (self-hosted OIDC identity provider). Two OIDC applications share
  // one tenant: consumer (students + landlords) and staff (admin/ops),
  // isolated by client_id/secret for blast-radius separation — see
  // apps/api/src/modules/auth/logto.config.ts.
  // This API's own public origin — used to build the Logto redirect_uri
  // (`${AUTH_API_URL}/api/auth/logto/callback`, already registered with
  // both Logto applications during provisioning). Falls back to localhost
  // for local dev, same pattern BETTER_AUTH_URL used to serve.
  AUTH_API_URL: z.string().url().optional(),
  LOGTO_ENDPOINT: z.string().url().optional(),
  LOGTO_CONSUMER_APP_ID: z.string().min(1).optional(),
  LOGTO_CONSUMER_APP_SECRET: z.string().min(1).optional(),
  LOGTO_STAFF_APP_ID: z.string().min(1).optional(),
  LOGTO_STAFF_APP_SECRET: z.string().min(1).optional(),
  // Machine-to-machine credential for the Logto Management API (provisioning
  // users/passwords — never used for end-user session issuance).
  LOGTO_M2M_APP_ID: z.string().min(1).optional(),
  LOGTO_M2M_APP_SECRET: z.string().min(1).optional(),
  // Encrypts the transient sign-in-session cookie (PKCE verifier/state)
  // between the /logto/sign-in redirect and the /logto/callback request.
  LOGTO_COOKIE_SECRET: z.string().min(32).optional(),
  // Shared bearer secrets Logto's HTTP SMS/Email connectors present when
  // calling back into our webhooks — rejects any caller who doesn't have it.
  LOGTO_SMS_WEBHOOK_SECRET: z.string().min(1).optional(),
  LOGTO_EMAIL_WEBHOOK_SECRET: z.string().min(1).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  AUTH_EMAIL_FROM: z.string().min(1).default('CampusHomes <hello@campushomes.ug>'),
  // Comma-separated inbox(es) that receive new student inquiries. Unset =
  // inquiries are stored only (dev/staging posture); set + RESEND_API_KEY in
  // production for the email leg of the support desk.
  SUPPORT_NOTIFY_EMAILS: z.string().min(1).optional(),
  AUTH_APP_URL: z.string().url().default('http://localhost:3000'),
  // Required when the browser-facing web app and this API use sibling
  // subdomains. Omit locally so development cookies remain host-only.
  AUTH_COOKIE_DOMAIN: z
    .string()
    .regex(/^(?:\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i)
    .optional(),
  AFRICASTALKING_USERNAME: z.string().min(1).default('sandbox'),
  // Product launch gate. Payments are deliberately off unless the deployment
  // opts in with the exact string `true`; missing, false, and misspelled values
  // all preserve the Phase 1 no-money posture.
  PAYMENTS_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  FLUTTERWAVE_SECRET_KEY: z.string().min(1).optional(),
  FLUTTERWAVE_WEBHOOK_HASH: z.string().min(1).optional(),
  AFRICASTALKING_API_KEY: z.string().min(1).optional(),
  // Escape hatch for a staging deploy that has no real payment/SMS provider
  // yet: lets the stub adapters run under NODE_ENV=production instead of
  // failing boot. Compared against the exact string 'true' rather than
  // z.coerce.boolean() — coercion treats the string 'false' as true, which
  // would silently disarm the guard. Anything else, typo included, stays off.
  ALLOW_STUB_INTEGRATIONS: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  CLOUDINARY_URL: z.string().min(1).optional(),
  SENTRY_DSN: z.string().optional(),
  POWER_BI_PUSH_URL: z.string().url().optional(),
  POWER_BI_API_TOKEN: z.string().min(1).optional(),
  // Base URL clients are redirected back to after Flutterwave checkout.
  PAYMENT_REDIRECT_URL: z.string().min(1).default('http://localhost:3000/reservations'),
  // The web app's origin — CORS allowlist. Set to the public frontend URL
  // for the current deployment environment.
  WEB_ORIGIN: z.string().min(1).default('http://localhost:3000'),
  SOKETI_HOST: z.string().min(1).optional(),
  SOKETI_PORT: z.coerce.number().int().default(443),
  SOKETI_APP_ID: z.string().min(1).optional(),
  SOKETI_KEY: z.string().min(1).optional(),
  SOKETI_SECRET: z.string().min(1).optional(),
});
// NOTE: integration secrets are optional now so the app boots during early
// development; each module that consumes one must assert presence at its own
// boot (e.g. ReservationsModule throws without FLUTTERWAVE_SECRET_KEY).

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // `KEY=` in a .env file arrives as an empty string — treat it as unset so
  // optional secrets left blank don't fail their min-length checks.
  const withoutBlanks = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  const parsed = envSchema.safeParse(withoutBlanks);
  if (!parsed.success) {
    // List missing keys only — never echo values, they may be secrets.
    const issues = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}
