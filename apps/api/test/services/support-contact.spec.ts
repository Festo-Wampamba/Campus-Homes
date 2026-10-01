import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import { ListingsService } from '../../src/modules/listings/listings.service';
import { testDatabaseUrl } from '../test-database-url';

const TEST_DATABASE_URL = testDatabaseUrl();

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 2 });

afterAll(() => pool.end());

describe('public support contact', () => {
  it('is the campushomes.co.ug address after migration 0056 replaces the seeded placeholder', async () => {
    const contact = await new ListingsService(new RlsDb(pool)).supportContact();
    expect(contact.email).toBe('hello@campushomes.co.ug');
  });
});
