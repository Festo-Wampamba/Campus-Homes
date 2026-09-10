import { inviteStaffSchema } from '@campushomes/shared';
import type { PoolClient } from 'pg';
import type { LogtoManagementClient } from '../../src/modules/auth/logto-management.client';
import { acceptInvitationsInTransaction, InvitationDeliveryService } from '../../src/modules/staff/invitations.service';

jest.mock('../../src/config/env', () => ({
  loadEnv: () => ({ WEB_ORIGIN: 'https://campushomes.example', RESEND_API_KEY: 'test-key', AUTH_EMAIL_FROM: 'staff@example.com' }),
}));

describe('staff invitation email delivery', () => {
  const createOneTimeToken = jest.fn();
  const delivery = new InvitationDeliveryService({ createOneTimeToken } as unknown as LogtoManagementClient);
  const originalFetch = global.fetch;
  const now = new Date('2026-09-10T10:00:00Z');
  const invitation = { email: 'staff+invite@example.com', expiresAt: new Date('2026-09-17T10:00:00Z') };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    createOneTimeToken.mockReset().mockResolvedValue({ token: 'one-time-value' });
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });
  afterEach(() => { jest.useRealTimers(); global.fetch = originalFetch; });

  it('sends an encoded staff link and limits its lifetime to role validity', async () => {
    await delivery.send({ ...invitation, validUntil: '2026-09-10T11:00:00Z' });
    expect(createOneTimeToken).toHaveBeenCalledWith(invitation.email, 'SignIn', 3600);
    const init = (global.fetch as jest.Mock).mock.calls[0][1];
    const body = JSON.parse(init.body);
    const url = new URL(body.text.match(/https:\/\/\S+/)[0].replace(/\.$/, ''));
    expect(url.pathname).toBe('/api/auth/logto/sign-in');
    expect(Object.fromEntries(url.searchParams)).toEqual({ portal: 'staff', intent: 'staff', token: 'one-time-value', email: invitation.email });
    expect(body.to).toEqual([invitation.email]);
    expect(body.text).toContain('authenticator verification');
  });

  it('requests a fresh token for every delivery attempt', async () => {
    createOneTimeToken.mockResolvedValueOnce({ token: 'first' }).mockResolvedValueOnce({ token: 'second' });
    await delivery.send(invitation);
    await delivery.send(invitation);
    expect(createOneTimeToken).toHaveBeenCalledTimes(2);
    expect((global.fetch as jest.Mock).mock.calls[1][1].body).toContain('token=second');
  });

  it.each([
    { ...invitation, email: null },
    { ...invitation, expiresAt: now },
    { ...invitation, validUntil: now.toISOString() },
  ])('does not issue a token for an undeliverable or expired invitation', async (input) => {
    await expect(delivery.send(input)).rejects.toThrow();
    expect(createOneTimeToken).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('propagates a generic delivery failure without provider response content', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    await expect(delivery.send(invitation)).rejects.toThrow('Invitation email delivery failed');
  });

  it('requires email in the public invitation contract and keeps phone optional', () => {
    const base = { name: 'Staff', roleKey: 'support_admin', scopeType: 'platform_wide', reason: 'Hire' };
    expect(inviteStaffSchema.safeParse({ ...base, phone: '+256700000001' }).success).toBe(false);
    expect(inviteStaffSchema.safeParse({ ...base, email: invitation.email }).success).toBe(true);
  });

  it('rejects invitation acceptance by a different linked account', async () => {
    const client = { query: jest.fn().mockResolvedValueOnce({ rows: [{
      id: 'invite', targetUserId: 'intended-account',
    }] }).mockResolvedValueOnce({ rows: [{ id: 'other-account' }] }) } as unknown as PoolClient;
    await expect(acceptInvitationsInTransaction(client, 'other-account', {
      sub: 'other-sub', email: invitation.email, emailVerified: true,
    })).rejects.toThrow('Invitation belongs to another account');
    expect(client.query).toHaveBeenCalledTimes(2);
  });
});
