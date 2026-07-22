import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { toNodeHandler } from 'better-auth/node';
import { json, urlencoded } from 'express';
import type { Express, NextFunction, Request, Response } from 'express';

import { AppModule } from './app.module';
import { loadEnv } from './config/env';
import { RlsDb } from './db/db.module';
import type { Auth } from './modules/auth/auth.config';
import { AUTH } from './modules/auth/auth.tokens';

async function bootstrap() {
  const env = loadEnv();
  // Better Auth reads the raw request stream itself — Nest's global body
  // parser would consume it first, so parsing is disabled here and re-added
  // right after the auth route (registration order keeps /api/auth unparsed).
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // Cookie-based auth from the web app (different origin even on localhost:
  // 3000 vs 4000) — credentials require an explicit origin, never '*'.
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  const auth = app.get<Auth>(AUTH);
  const http = app.getHttpAdapter().getInstance() as Express;
  http.all('/api/auth/{*any}', toNodeHandler(auth));
  app.use(json());
  app.use(urlencoded({ extended: true }));
  const rlsDb = app.get(RlsDb);
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
  app.setGlobalPrefix('api/v1');
  await app.listen(env.PORT);
}

void bootstrap();
