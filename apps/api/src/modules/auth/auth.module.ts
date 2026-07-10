import { Module } from '@nestjs/common';
import { Pool } from 'pg';

import {
  AfricasTalkingMessaging,
  ConsoleMessaging,
  type MessagingAdapter,
} from '../../adapters/messaging.adapter';
import { loadEnv } from '../../config/env';
import { createDb } from '../../db/client';
import { createAuth } from './auth.config';
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
        if (env.NODE_ENV === 'production') {
          throw new Error('AuthModule requires AFRICASTALKING_API_KEY in production');
        }
        return new ConsoleMessaging();
      },
    },
    {
      provide: AUTH,
      inject: [MESSAGING],
      useFactory: (messaging: MessagingAdapter) => {
        const env = loadEnv();
        // Dedicated service-context pool for Better Auth only. Every one of
        // its queries is pre-auth identity bootstrapping (user lookup by
        // phone/email, OTP verify, session validate), so the RLS context is
        // service_role — set as a connection-startup GUC, so it can never be
        // client-derived and never leaks: this pool is not exported and no
        // request-scoped code touches it.
        const pool = new Pool({
          connectionString: env.DATABASE_URL,
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
