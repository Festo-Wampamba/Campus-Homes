import { Module } from '@nestjs/common';

import {
  AfricasTalkingMessaging,
  ConsoleMessaging,
  type MessagingAdapter,
} from '../../adapters/messaging.adapter';
import { loadEnv } from '../../config/env';
import { assertStubAllowed } from '../../config/integration-guard';
import { AuthController, SessionController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { LogtoEmailWebhookController } from './logto-email-webhook.controller';
import { LogtoManagementClient } from './logto-management.client';
import { LogtoSmsWebhookController } from './logto-sms-webhook.controller';
import { MESSAGING } from './auth.tokens';
import { ProvisioningService } from './provisioning.service';
import { SessionStore } from './session.store';

@Module({
  controllers: [AuthController, SessionController, LogtoSmsWebhookController, LogtoEmailWebhookController],
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
      provide: LogtoManagementClient,
      useFactory: () => new LogtoManagementClient(loadEnv()),
    },
    ProvisioningService,
    SessionStore,
    AuthGuard,
  ],
  exports: [MESSAGING, LogtoManagementClient, ProvisioningService, SessionStore, AuthGuard],
})
export class AuthModule {}
