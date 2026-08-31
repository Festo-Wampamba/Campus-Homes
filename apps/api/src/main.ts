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
  'auth/logto/sign-in',
  'auth/logto/callback',
  'auth/logto/sign-out',
  'auth/logto/sms-webhook',
  'auth/logto/email-webhook',
  'auth/session',
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
