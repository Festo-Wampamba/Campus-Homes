import type Redis from 'ioredis';
import { PhoneOtpDelivery } from './otp-delivery';
import { LogtoEmailWebhookController } from './logto-email-webhook.controller';
import { LogtoSmsWebhookController } from './logto-sms-webhook.controller';

describe('OTP connector delivery', () => {
  const originalEnv = process.env;
  const quota = jest.fn();
  const delivery = new PhoneOtpDelivery({ eval: quota } as unknown as Redis);
  let fetchMock: jest.SpyInstance;
  beforeEach(() => {
    process.env = { ...originalEnv, DATABASE_URL: 'postgresql://localhost/test', PHONE_OTP_CHANNEL: 'whatsapp',
      LOGTO_SMS_WEBHOOK_SECRET: 'sms-secret', LOGTO_EMAIL_WEBHOOK_SECRET: 'email-secret',
      WHATSAPP_GRAPH_API_VERSION: 'v23.0', WHATSAPP_PHONE_NUMBER_ID: '12345', WHATSAPP_ACCESS_TOKEN: 'token',
      WHATSAPP_AUTH_TEMPLATE_NAME: 'campushomes_code', RESEND_API_KEY: 're_test' };
    quota.mockReset().mockResolvedValue(1);
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] })));
  });
  afterEach(() => { process.env = originalEnv; jest.restoreAllMocks(); });

  it('sends a copy-code authentication template and uses authenticated source IP', async () => {
    await new LogtoSmsWebhookController(delivery).handle('Bearer sms-secret', {
      to: '256700000199', type: 'SignIn', payload: { code: '123456' }, ip: '192.0.2.1',
    });
    expect(fetchMock.mock.calls[0][0]).toBe('https://graph.facebook.com/v23.0/12345/messages');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ messaging_product: 'whatsapp', to: '256700000199',
      template: { name: 'campushomes_code', language: { code: 'en' }, components: [
        { type: 'body', parameters: [{ type: 'text', text: '123456' }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '123456' }] },
      ] } });
    expect(JSON.stringify(quota.mock.calls)).not.toContain('256700000199');
    expect(JSON.stringify(quota.mock.calls)).not.toContain('192.0.2.1');
    expect(quota.mock.calls[0][1]).toBe(2);
  });

  it('keeps the recipient quota when an older connector omits the client IP', async () => {
    await new LogtoSmsWebhookController(delivery).handle('Bearer sms-secret', {
      to: '256700000199', type: 'SignIn', payload: { code: '123456' },
    });
    expect(quota.mock.calls[0][1]).toBe(1);
  });

  it.each([null, {}, { to: 123 }, { to: '+256700000199', type: 'SignIn', payload: {} },
    { to: '+256700000199', type: 'SignIn', payload: { code: '<script>' } }])('rejects malformed input before delivery: %j', async (body) => {
    await expect(new LogtoSmsWebhookController(delivery).handle('Bearer sms-secret', body)).rejects.toThrow('Invalid verification request');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects disabled delivery and never falls back to SMS', async () => {
    process.env.PHONE_OTP_CHANNEL = 'disabled';
    await expect(delivery.send('+256700000199', '123456', '192.0.2.1')).rejects.toThrow('temporarily unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects a quota violation before contacting Meta', async () => {
    quota.mockResolvedValue(0);
    await expect(delivery.send('+256700000199', '123456', '192.0.2.1')).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('fails closed when Redis fails', async () => {
    quota.mockRejectedValue(new Error('offline'));
    await expect(delivery.send('+256700000199', '123456', '192.0.2.1')).rejects.toThrow('temporarily unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([new Response('{}', { status: 400 }), new Response('{}')])('requires provider acceptance', async (response) => {
    fetchMock.mockResolvedValue(response);
    await expect(delivery.send('+256700000199', '123456', '192.0.2.1')).rejects.toThrow('temporarily unavailable');
  });
  it('sanitizes timeout failures and does not log codes', async () => {
    const log = jest.spyOn(console, 'error');
    fetchMock.mockRejectedValue(new Error('timeout recipient 256700000199 code 123456'));
    await expect(delivery.send('+256700000199', '123456', '192.0.2.1')).rejects.toThrow('temporarily unavailable');
    expect(log).not.toHaveBeenCalled();
  });
  it.each(['SignIn', 'Register', 'ForgotPassword', 'Generic'])('delivers the %s email template', async (type) => {
    await new LogtoEmailWebhookController().handle('Bearer email-secret', { to: 'a@example.com', type, payload: { code: '123456' } });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.resend.com/emails');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).text).toContain('123456');
  });
  it('rejects unauthorized email and malformed addresses', async () => {
    const controller = new LogtoEmailWebhookController();
    await expect(controller.handle(undefined, null)).rejects.toMatchObject({ status: 401 });
    await expect(controller.handle('Bearer email-secret', { to: 'invalid', type: 'SignIn', payload: { code: '123456' } })).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not silently accept email without production credentials', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.RESEND_API_KEY;
    await expect(new LogtoEmailWebhookController().handle('Bearer email-secret', { to: 'a@example.com', type: 'SignIn', payload: { code: '123456' } })).rejects.toThrow('temporarily unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
