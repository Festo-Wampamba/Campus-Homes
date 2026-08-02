/**
 * LedgerService.postAutoEntry against the real docker test DB — account code
 * resolution, balanced posting, and the unknown-code failure path.
 */
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import { LedgerService } from '../../src/modules/finance/ledger.service';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const ledger = new LedgerService();

const SERVICE_CTX: RlsContext = { userId: '00000000-0000-0000-0000-000000000000', role: 'service_role' };

afterAll(async () => {
  await pool.end();
});

describe('LedgerService.postAutoEntry', () => {
  it('resolves account codes and posts a balanced entry', async () => {
    const entryId = await rlsDb.run(SERVICE_CTX, (db) =>
      ledger.postAutoEntry(db, {
        memo: 'ledger.spec.ts balanced posting',
        lines: [
          { accountCode: '1000', debitUgx: 2500 },
          { accountCode: '4000', creditUgx: 2500 },
        ],
      }),
    );

    const rows = await rlsDb.run(SERVICE_CTX, async (_db, client) =>
      client.query(
        `SELECT a.code, jl.debit_ugx AS "debitUgx", jl.credit_ugx AS "creditUgx"
         FROM journal_lines jl JOIN ledger_accounts a ON a.id = jl.account_id
         WHERE jl.entry_id = $1 ORDER BY a.code`,
        [entryId],
      ),
    );
    expect(rows.rows).toEqual([
      { code: '1000', debitUgx: 2500, creditUgx: 0 },
      { code: '4000', debitUgx: 0, creditUgx: 2500 },
    ]);
  });

  it('throws on an unknown account code', async () => {
    await expect(
      rlsDb.run(SERVICE_CTX, (db) =>
        ledger.postAutoEntry(db, {
          memo: 'ledger.spec.ts unknown code',
          lines: [
            { accountCode: '1000', debitUgx: 100 },
            { accountCode: 'not-a-real-code', creditUgx: 100 },
          ],
        }),
      ),
    ).rejects.toThrow(/unknown ledger account code/i);
  });
});
