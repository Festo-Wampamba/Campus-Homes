import { BadRequestException, Body, Controller, Headers, HttpCode, Post, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { authenticateConnector, parseConnectorPayload } from './otp-delivery';

import { loadEnv } from '../../config/env';
import { sendVerificationCodeEmail, type VerificationEmailKind } from './auth.email';

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
  @Post()
  @HttpCode(204)
  async handle(@Headers('authorization') authorization: string | undefined, @Body() body: unknown) {
    const env = loadEnv();
    authenticateConnector(authorization, env.LOGTO_EMAIL_WEBHOOK_SECRET);
    const input = parseConnectorPayload(body);
    if (!z.string().email().safeParse(input.to).success) throw new BadRequestException('Invalid verification request');
    try {
      await sendVerificationCodeEmail(env, { to: input.to, code: input.payload.code, kind: verificationKindFor(input.type) });
    } catch {
      throw new ServiceUnavailableException('Verification delivery temporarily unavailable');
    }
  }
}
