import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

import { AppModule } from './app.module';
import { loadEnv } from './config/env';
import { RlsDb } from './db/db.module';

// Routes that must NOT get the /api/v1 prefix — their exact paths are
// already registered as Logto/Google redirect URIs and connector webhook
// endpoints, set during Phase 1 provisioning.
const AUTH_ROUTES = [
  'api/auth/logto/sign-in',
  'api/auth/logto/callback',
  'api/auth/logto/sign-out',
  'api/auth/logto/sms-webhook',
  'api/auth/logto/email-webhook',
  'api/auth/session',
];

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  // Cookie-based auth from the web app (different origin even on localhost:
  // 3000 vs 4000) — credentials require an explicit origin, never '*'.
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  const rlsDb = app.get(RlsDb);
  const http = app.getHttpAdapter().getInstance();
  // This API had no security headers at all, while the Logto instance it
  // redirects into sets the full set — an audit of the live staging response
  // headers found HSTS/nosniff/referrer/frame/CSP all absent here, plus an
  // `X-Powered-By: Express` stack disclosure. The sign-in route is a
  // browser-facing top-level navigation (it 302s into the OIDC flow), so
  // these apply to real page loads, not just XHR. Hand-rolled rather than
  // adding helmet: this is the whole policy for a service that returns JSON
  // and redirects, never HTML that legitimately frames or loads scripts.
  http.disable('x-powered-by');
  http.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    // Referrer would otherwise carry OIDC state/code query params to Logto
    // and to any error-page host on cross-origin navigations.
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    next();
  });
  http.use('/api/v1', async (req: Request, res: Response, next: NextFunction) => {
    const isExempt = req.originalUrl.startsWith('/api/v1/admin') || req.originalUrl.startsWith('/api/v1/health');
    if (isExempt || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    try {
      const maintenance = await rlsDb.run(
        { userId: '00000000-0000-0000-0000-000000000000', role: 'service_role' },
        async (_db, client) => (await client.query<{ enabled: boolean }>(`
          SELECT coalesce((value #>> '{}')::boolean, false) AS enabled
          FROM platform_settings WHERE key = 'maintenance_mode'
        `)).rows[0]?.enabled ?? false,
      );
      if (maintenance) {
        return res.status(503).json({
          statusCode: 503,
          message: 'CampusHomes is in maintenance mode. Public changes are temporarily paused.',
        });
      }
      return next();
    } catch {
      // Dependency health is reported by /health. Do not turn a settings read
      // failure into a second, misleading application error here.
      return next();
    }
  });
  app.setGlobalPrefix('api/v1', {
    // Keep the service root useful when an operator opens the Dokploy domain
    // directly. Health/readiness still lives at /api/v1/health.
    exclude: [
      { path: '/', method: RequestMethod.GET },
      ...AUTH_ROUTES.map((path) => ({ path, method: RequestMethod.ALL })),
    ],
  });
  await app.listen(env.PORT, '0.0.0.0');
}

void bootstrap();
