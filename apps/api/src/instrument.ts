import * as Sentry from '@sentry/nestjs';

import { loadEnv } from './config/env';

// Imported first in main.ts so Sentry can patch http/express before Nest
// loads them. loadEnv() fails fast on a malformed DSN or a DSN without
// SENTRY_ENVIRONMENT. No DSN = no-op: local dev and tests never send events.
const { SENTRY_DSN, SENTRY_ENVIRONMENT } = loadEnv();
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    // Errors only, so tracesSampleRate is deliberately absent: setting it,
    // even to 0, switches on tracing instrumentation for every request and
    // query.
    sendDefaultPii: false,
  });
}
