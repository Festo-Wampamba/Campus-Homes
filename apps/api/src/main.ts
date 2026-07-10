import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { toNodeHandler } from 'better-auth/node';
import { json, urlencoded } from 'express';
import type { Express } from 'express';

import { AppModule } from './app.module';
import { loadEnv } from './config/env';
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
  app.setGlobalPrefix('api/v1');
  await app.listen(env.PORT);
}

void bootstrap();
