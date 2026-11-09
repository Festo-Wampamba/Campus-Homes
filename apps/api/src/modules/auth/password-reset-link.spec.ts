import { AuthController } from './auth.controller';
import { verificationContent } from './auth.email';
import { passwordResetUrl } from './logto.config';
import type { Env } from '../../config/env';
import type { LogtoClientFactory } from './logto-client.factory';
import type { ProvisioningService } from './provisioning.service';
import type { SessionStore } from './session.store';
import type { AuthTransactions } from './auth-transactions';
import type { LogtoManagementClient } from './logto-management.client';
process.env.DATABASE_URL ??= 'postgresql://localhost/test';
process.env.WEB_ORIGIN = 'https://campushomes.example';
const token = 'opaque-secret';
test('email provides a clickable reset alternative and keeps the OTP', () => {
  const url = passwordResetUrl({ WEB_ORIGIN: 'https://campushomes.example' } as Env, token, 'student+test@example.com');
  expect(new URL(url).searchParams.get('email')).toBe('student+test@example.com');
  expect(new URL(url).searchParams.get('screen')).toBe('reset_password');
  const mail = verificationContent('forgot-password', '123456', new Date(), url);
  expect(mail.html).toContain('Reset my password</a>'); expect(mail.text).toContain(url); expect(mail.text).toContain('123456');
  expect(verificationContent('sign-in', '123456', new Date(), url).html).not.toContain('Reset my password</a>');
});
test.each(['student', 'landlord'])('reset link starts a provider reset for %s', async (intent) => {
  const signIn = jest.fn();
  const controller = new AuthController({} as ProvisioningService, {} as SessionStore, {} as AuthTransactions,
    { create: async () => ({ signIn }) } as unknown as LogtoClientFactory, {} as LogtoManagementClient);
  const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
  await controller.signIn('consumer', token, 'student@example.com', undefined, res as never, intent, 'reset_password');
  expect(signIn).toHaveBeenCalledWith(expect.objectContaining({ extraParams: expect.objectContaining({ first_screen: 'reset_password', one_time_token: token }), loginHint: 'student@example.com' }));
});
