import { Pool } from 'pg';

import { trackEventSchema } from '@campushomes/shared';

import { RlsDb } from '../../src/db/db.module';
import { ListingsService } from '../../src/modules/listings/listings.service';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 2 });
const listings = new ListingsService(new RlsDb(pool));
const path = `/test-${Date.now()}`;

afterAll(async () => {
  await pool.query(`DELETE FROM product_events WHERE payload->>'path' = $1`, [path]);
  await pool.end();
});

describe('product events', () => {
  it('records a page view with its path', async () => {
    await listings.recordEvent({ type: 'page_view', path });
    const { rows } = await pool.query(`SELECT event_type FROM product_events WHERE payload->>'path' = $1`, [path]);
    expect(rows).toEqual([{ event_type: 'page_view' }]);
  });

  it('rejects a path carrying a query string', () => {
    expect(trackEventSchema.safeParse({ type: 'page_view', path: '/search?q=secret' }).success).toBe(false);
  });
});
