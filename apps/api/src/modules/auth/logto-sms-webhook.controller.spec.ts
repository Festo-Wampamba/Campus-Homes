import { UnauthorizedException } from '@nestjs/common';

import { LogtoSmsWebhookController } from './logto-sms-webhook.controller';

process.env.LOGTO_SMS_WEBHOOK_SECRET ??= 'test-webhook-secret';
// loadEnv() requires the full schema; the other required-in-some-paths
// vars aren't needed for this controller, so a minimal DATABASE_URL is
// enough to get past zod's baseline check.
process.env.DATABASE_URL ??= 'postgresql://localhost/test';

describe('LogtoSmsWebhookController', () => {
  const sendSms = jest.fn().mockResolvedValue(undefined);
  const controller = new LogtoSmsWebhookController({ sendSms });
  const auth = `Bearer ${process.env.LOGTO_SMS_WEBHOOK_SECRET}`;

  beforeEach(() => sendSms.mockClear());

  it('rejects a missing/wrong bearer secret', async () => {
    await expect(
      controller.handle('Bearer wrong', { to: '+256700000199', type: 'Register', payload: { code: '123456' } }),
    ).rejects.toThrow(UnauthorizedException);
    expect(sendSms).not.toHaveBeenCalled();
  });

  // Logto's own interaction logs (checked live against the real tenant)
  // show its internal identifier as bare digits with no leading `+` — the
  // connector docs' own example payload claims a `+` prefix, which does
  // NOT match what this tenant actually sends. Both must work.
  it.each([
    ['with a leading +', '+256700000199'],
    ['without a leading + (what Logto actually sends)', '256700000199'],
  ])('accepts a Uganda number %s', async (_label, to) => {
    await controller.handle(auth, { to, type: 'Register', payload: { code: '123456' } });
    expect(sendSms).toHaveBeenCalledWith('+256700000199', expect.stringContaining('123456'));
  });

  it('rejects a non-Uganda number', async () => {
    await expect(
      controller.handle(auth, { to: '+14155551234', type: 'Register', payload: { code: '123456' } }),
    ).rejects.toThrow('Phone number outside supported range');
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('rejects a malformed number of the right length coincidence', async () => {
    await expect(
      controller.handle(auth, { to: 'not-a-phone-2', type: 'Register', payload: { code: '123456' } }),
    ).rejects.toThrow('Phone number outside supported range');
  });
});
