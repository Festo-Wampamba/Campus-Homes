import { Body, Controller, Headers, HttpCode, Post, UnauthorizedException } from '@nestjs/common';

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
@Controller('auth/logto/email-webhook')
export class LogtoEmailWebhookController {
  @Post()
  @HttpCode(204)
  async handle(@Headers('authorization') authorization: string | undefined, @Body() body: LogtoEmailWebhookBody) {
    const env = loadEnv();
    if (!env.LOGTO_EMAIL_WEBHOOK_SECRET || authorization !== `Bearer ${env.LOGTO_EMAIL_WEBHOOK_SECRET}`) {
      throw new UnauthorizedException();
    }
    await sendVerificationCodeEmail(env, { to: body.to, code: body.payload.code, kind: verificationKindFor(body.type) });
  }
}
