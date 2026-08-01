import { Module } from '@nestjs/common';
import { Pool } from 'pg';

import {
  AfricasTalkingMessaging,
  ConsoleMessaging,
  type MessagingAdapter,
} from '../../adapters/messaging.adapter';
import { loadEnv } from '../../config/env';
import { assertStubAllowed } from '../../config/integration-guard';
import { createDb } from '../../db/client';
import { createAuth } from './auth.config';
import { resolveAuthDatabaseUrl } from './auth-database';
import { AuthGuard } from './auth.guard';
import { AUTH, MESSAGING } from './auth.tokens';

@Module({
  providers: [
    {
      provide: MESSAGING,
      useFactory: (): MessagingAdapter => {
        const env = loadEnv();
        if (env.AFRICASTALKING_API_KEY) {
          return new AfricasTalkingMessaging(env.AFRICASTALKING_API_KEY, env.AFRICASTALKING_USERNAME);
        }
        assertStubAllowed(env, 'AFRICASTALKING_API_KEY', 'AuthModule');
        return new ConsoleMessaging();
      },
    },
    {
      provide: AUTH,
      inject: [MESSAGING],
      useFactory: (messaging: MessagingAdapter) => {
        const env = loadEnv();
        // Dedicated direct service-context pool for Better Auth only. Every
        // query is pre-auth identity bootstrapping (user lookup by phone/email,
        // OTP verify, session validate), so the RLS context is service_role.
        // Neon PgBouncer rejects custom startup options, hence this separate
        // direct URL while the rest of the API continues using DATABASE_URL.
        const pool = new Pool({
          connectionString: resolveAuthDatabaseUrl(env),
          max: 5,
          options: '-c app.user_role=service_role',
        });
        return createAuth(env, createDb(pool), messaging);
      },
    },
    AuthGuard,
  ],
  exports: [AUTH, MESSAGING, AuthGuard],
})
export class AuthModule {}
