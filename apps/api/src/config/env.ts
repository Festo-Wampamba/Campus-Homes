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
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_API_KEY: z.string().min(1).optional(),
  BETTER_AUTH_URL: z.string().min(1).optional(),
  AFRICASTALKING_USERNAME: z.string().min(1).default('sandbox'),
  FLUTTERWAVE_SECRET_KEY: z.string().min(1).optional(),
  FLUTTERWAVE_WEBHOOK_HASH: z.string().min(1).optional(),
  AFRICASTALKING_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_URL: z.string().min(1).optional(),
  SENTRY_DSN: z.string().optional(),
  POWER_BI_PUSH_URL: z.string().url().optional(),
  POWER_BI_API_TOKEN: z.string().min(1).optional(),
  // Base URL clients are redirected back to after Flutterwave checkout.
  PAYMENT_REDIRECT_URL: z.string().min(1).default('http://localhost:3000/reservations'),
  // The web app's origin — CORS allowlist + Better Auth trustedOrigins.
  // Set to the Vercel URL in production (FRONTEND.md §9).
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
