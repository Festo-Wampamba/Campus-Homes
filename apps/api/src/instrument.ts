import * as Sentry from '@sentry/nestjs';

// Imported first in main.ts so Sentry can patch http/express before Nest
// loads them. No DSN = no-op: local dev and tests never send events.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    // Staging and production both run NODE_ENV=production.
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    // Errors only. Tracing spends quota and isn't needed for launch.
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}
