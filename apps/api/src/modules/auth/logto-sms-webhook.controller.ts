import { Body, Controller, Headers, HttpCode, Inject, Post, UnauthorizedException } from '@nestjs/common';

import { loadEnv } from '../../config/env';
import type { MessagingAdapter } from '../../adapters/messaging.adapter';
import { MESSAGING } from './auth.tokens';

interface LogtoSmsWebhookBody {
  to: string;
  type: 'SignIn' | 'Register' | 'ForgotPassword' | 'Generic';
  payload: { code: string };
}

// Logto's built-in HTTP SMS connector target (configured in the Admin
// Console during Phase 1 provisioning) — reuses the same Africa's Talking
// adapter Better Auth's phoneNumber plugin used to call directly.
@Controller('api/auth/logto/sms-webhook')
export class LogtoSmsWebhookController {
  constructor(@Inject(MESSAGING) private readonly messaging: MessagingAdapter) {}

  @Post()
  @HttpCode(204)
  async handle(@Headers('authorization') authorization: string | undefined, @Body() body: LogtoSmsWebhookBody) {
    const env = loadEnv();
    if (!env.LOGTO_SMS_WEBHOOK_SECRET || authorization !== `Bearer ${env.LOGTO_SMS_WEBHOOK_SECRET}`) {
      throw new UnauthorizedException();
    }
    // Defense in depth, independent of whatever country restriction Logto's
    // own phone input may or may not enforce — students are Uganda-only.
    if (!body.to?.startsWith('+256')) {
      throw new UnauthorizedException('Phone number outside supported range');
    }
    await this.messaging.sendSms(body.to, `Your CampusHomes verification code is ${body.payload.code}`);
  }
}
