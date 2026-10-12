import { AuthController } from './auth.controller';
import type { AuthTransactions } from './auth-transactions';
import { transactionCookie } from './auth-transactions';
import type { LogtoClientFactory } from './logto-client.factory';
import type { LogtoManagementClient } from './logto-management.client';
import type { ProvisioningService } from './provisioning.service';
import type { SessionStore } from './session.store';

// loadEnv() requires the full schema; a minimal DATABASE_URL gets past zod.
process.env.DATABASE_URL ??= 'postgresql://localhost/test';

const STATE = 'a'.repeat(43);

function response() {
  return { redirect: jest.fn(), setHeader: jest.fn(), clearCookie: jest.fn() };
}

// The Logto exchange fails after the transaction is read, so the callback
// reports sign_in_failed; only the page it reports on differs by portal.
async function failedCallback(portal: 'staff' | 'consumer'): Promise<string> {
  const transactions = { consume: jest.fn().mockResolvedValue({ portal, storage: {}, nonce: 'n' }) };
  const clients = { create: jest.fn().mockRejectedValue(new Error('invalid_client')) };
  const controller = new AuthController(
    {} as ProvisioningService,
    {} as SessionStore,
    transactions as unknown as AuthTransactions,
    clients as unknown as LogtoClientFactory,
    {} as LogtoManagementClient,
  );
  const res = response();
  const req = { query: { state: STATE }, headers: { cookie: `${transactionCookie(STATE)}=secret` }, originalUrl: '/x' };

  await controller.callback(req as never, res as never);

  return new URL(res.redirect.mock.calls[0][0] as string).pathname;
}

describe('AuthController callback errors', () => {
  it('sends a failed staff sign-in back to /staff', async () => {
    expect(await failedCallback('staff')).toBe('/staff');
  });

  it('sends a failed consumer sign-in back to /sign-in', async () => {
    expect(await failedCallback('consumer')).toBe('/sign-in');
  });
});
