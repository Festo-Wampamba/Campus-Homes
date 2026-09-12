import type { PoolClient } from 'pg';

import { RlsDb } from '../../db/db.module';
import type { MessagingAdapter } from '../../adapters/messaging.adapter';
import { NotificationsService } from './notifications.service';

describe('NotificationsService.feedWithActions', () => {
  it('backfills an unread admin alert for an existing pending landlord application', async () => {
    const queries: string[] = [];
    const client = {
      query: jest.fn(async (text: string) => {
        const sql = text.replace(/\s+/g, ' ').trim();
        queries.push(sql);
        if (sql.startsWith('SELECT count(DISTINCT l.user_id)')) return { rows: [{ count: 1 }] };
        if (sql.startsWith('SELECT id FROM notifications')) return { rows: [] };
        if (sql.startsWith('INSERT INTO notifications')) return { rows: [] };
        throw new Error(`Unexpected query: ${sql}`);
      }),
    } as unknown as PoolClient;
    const feedRows = [{ id: 'notice-1' }];
    const db = {
      select: () => ({
        from: () => ({
          orderBy: () => ({ limit: async () => feedRows }),
        }),
      }),
    };
    const rlsDb = {
      run: async (ctx: { role: string }, fn: (value: unknown, poolClient: PoolClient) => unknown) =>
        fn(ctx.role === 'service_role' ? {} : db, client),
    } as unknown as RlsDb;
    const service = new NotificationsService(rlsDb, {} as MessagingAdapter);

    await expect(service.feedWithActions(
      { userId: '11111111-1111-4111-8111-111111111111', role: 'student' },
      ['super_admin'],
    )).resolves.toEqual(feedRows);

    expect(queries.some((sql) => sql.startsWith('INSERT INTO notifications'))).toBe(true);
  });
});
