import { BadRequestException, Body, Controller, Headers, HttpCode, Logger, Post, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { authenticateConnector, parseConnectorPayload } from './otp-delivery';

import { loadEnv } from '../../config/env';
import { EmailDeliveryError, sendVerificationCodeEmail, type VerificationEmailKind } from './auth.email';
import { LogtoManagementClient } from './logto-management.client';
import { passwordResetUrl } from './logto.config';

interface LogtoEmailWebhookBody {
  to: string;
  type: 'SignIn' | 'Register' | 'ForgotPassword' | 'Generic';
  payload: { code: string };
}

function verificationKindFor(type: LogtoEmailWebhookBody['type']): VerificationEmailKind {
  switch (type) {
    case 'SignIn':
      return 'sign-in';
    case 'Register':
      return 'register';
    case 'ForgotPassword':
      return 'forgot-password';
    default:
      return 'generic';
  }
}

// Logto's built-in HTTP Email connector target (configured in the Admin
// Console during Phase 1 provisioning) — reuses the existing Resend-backed
// email delivery rather than a Logto-native email connector, so all actual
// email sending stays on one adapter.
@Controller('api/auth/logto/email-webhook')
export class LogtoEmailWebhookController {
  private readonly logger = new Logger(LogtoEmailWebhookController.name);
  constructor(private readonly management: LogtoManagementClient) {}
  @Post()
  @HttpCode(204)
  async handle(@Headers('authorization') authorization: string | undefined, @Body() body: unknown) {
    const env = loadEnv();
    authenticateConnector(authorization, env.LOGTO_EMAIL_WEBHOOK_SECRET);
    const input = parseConnectorPayload(body);
    if (!z.string().email().safeParse(input.to).success) throw new BadRequestException('Invalid verification request');
    try {
      let resetUrl: string | undefined;
      if (input.type === 'ForgotPassword') {
        try {
          const { token } = await this.management.createOneTimeToken(input.to, 'ForgotPassword', 600);
          resetUrl = passwordResetUrl(env, token, input.to);
        } catch {
          // A provider-token outage must not suppress the working OTP alternative.
          this.logger.warn('password_reset.link_unavailable');
        }
      }
      await sendVerificationCodeEmail(env, { to: input.to, code: input.payload.code, kind: verificationKindFor(input.type), resetUrl });
    } catch (error) {
      this.logger.warn(`verification_email.delivery_failed kind=${input.type} status=${error instanceof EmailDeliveryError ? error.providerStatus : 'unavailable'}`);
      throw new ServiceUnavailableException('Verification delivery temporarily unavailable');
    }
  }
}
