import { BadRequestException, Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';

import { loadEnv } from '../../config/env';
import { authenticateConnector, parseConnectorPayload, PhoneOtpDelivery } from './otp-delivery';

/** Logto's own interaction logs show its internal phone identifier as bare
 * digits with no leading `+` (confirmed live via the Management API's
 * /api/logs against a real registration attempt — the HTTP SMS connector
 * docs' own example payload, which shows a leading `+`, did not match what
 * this tenant actually sends). Normalize to E.164-with-plus regardless of
 * which shape arrives, rather than trust either source blindly. */
function toE164(raw: string): string | null {
  if (!/^\+?256\d{9}$/.test(raw)) return null;
  return raw.startsWith('+') ? raw : `+${raw}`;
}

// Logto's built-in HTTP SMS connector target (configured in the Admin
// Console) — authentication codes now use WhatsApp exclusively.
@Controller('api/auth/logto/sms-webhook')
export class LogtoSmsWebhookController {
  constructor(private readonly delivery: PhoneOtpDelivery) {}

  @Post()
  @HttpCode(204)
  async handle(@Headers('authorization') authorization: string | undefined, @Body() body: unknown) {
    const env = loadEnv();
    authenticateConnector(authorization, env.LOGTO_SMS_WEBHOOK_SECRET);
    const input = parseConnectorPayload(body);
    // Defense in depth, independent of whatever country restriction Logto's
    // own phone input may or may not enforce — students are Uganda-only.
    const to = toE164(input.to);
    if (!to) {
      throw new BadRequestException('Phone number outside supported range');
    }
    // Only the authenticated connector payload supplies the end-user IP.
    // Older Logto versions omit it, so retain the recipient quota without
    // accidentally treating the reverse proxy as one global end-user IP.
    await this.delivery.send(to, input.payload.code, input.ip);
  }
}
