import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { BadRequestException, HttpException, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type Redis from 'ioredis';
import { z } from 'zod';
import { loadEnv } from '../../config/env';
import { REDIS } from '../../db/redis.module';

const connectorPayload = z.object({
  to: z.string().min(1).max(254),
  type: z.enum(['SignIn', 'Register', 'ForgotPassword', 'Generic']),
  payload: z.object({ code: z.string().regex(/^\d{4,8}$/) }),
  ip: z.string().refine((value) => isIP(value) !== 0).optional(),
});

export function authenticateConnector(authorization: string | undefined, secret: string | undefined) {
  const expected = Buffer.from(`Bearer ${secret ?? ''}`);
  const actual = Buffer.from(authorization ?? '');
  if (!secret || expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new UnauthorizedException();
}

export function parseConnectorPayload(body: unknown) {
  const result = connectorPayload.safeParse(body);
  if (!result.success) throw new BadRequestException('Invalid verification request');
  return result.data;
}

// Atomic fixed-window quotas. Rejected requests do not extend the window.
export const OTP_QUOTA_SCRIPT = `
if tonumber(redis.call('GET', KEYS[1]) or '0') >= 5 then return 0 end
if #KEYS > 1 and tonumber(redis.call('GET', KEYS[2]) or '0') >= 20 then return 0 end
for i = 1, #KEYS do
  if redis.call('INCR', KEYS[i]) == 1 then redis.call('EXPIRE', KEYS[i], 900) end
end
return 1`;

@Injectable()
export class PhoneOtpDelivery {
  constructor(@Inject(REDIS) private readonly redis: Redis | null) {}

  async send(to: string, code: string, sourceIp?: string) {
    const env = loadEnv();
    if (env.PHONE_OTP_CHANNEL !== 'whatsapp' || !this.redis || !env.LOGTO_SMS_WEBHOOK_SECRET) {
      throw new ServiceUnavailableException('Verification delivery temporarily unavailable');
    }
    const hash = (value: string) => createHmac('sha256', env.LOGTO_SMS_WEBHOOK_SECRET!).update(value).digest('hex');
    try {
      const recipientKey = `otp:{phone}:recipient:${hash(to)}`;
      const allowed = sourceIp
        ? await this.redis.eval(OTP_QUOTA_SCRIPT, 2, recipientKey, `otp:{phone}:source:${hash(sourceIp)}`)
        : await this.redis.eval(OTP_QUOTA_SCRIPT, 1, recipientKey);
      if (allowed !== 1) throw new HttpException('Please wait before requesting another code', 429);
      const response = await fetch(`https://graph.facebook.com/${env.WHATSAPP_GRAPH_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          messaging_product: 'whatsapp', to: to.slice(1), type: 'template',
          template: {
            name: env.WHATSAPP_AUTH_TEMPLATE_NAME,
            language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE },
            components: [
              { type: 'body', parameters: [{ type: 'text', text: code }] },
              { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
            ],
          },
        }),
      });
      if (!response.ok) throw new Error('Provider rejected delivery');
      const result = z.object({ messages: z.array(z.object({ id: z.string().min(1) })).min(1) }).safeParse(await response.json());
      if (!result.success) throw new Error('Missing provider acceptance');
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429) throw error;
      // Provider errors can contain the recipient/code. Never log them.
      throw new ServiceUnavailableException('Verification delivery temporarily unavailable');
    }
  }
}
