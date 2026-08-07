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

describe('LedgerService.postManualEntry', () => {
  let financeAdminId: string;

  beforeAll(async () => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Ledger Spec Finance Admin') RETURNING id`,
      ['+256700000901'],
    );
    financeAdminId = rows[0]!.id;
  });

  async function accountId(code: string): Promise<string> {
    const res = await pool.query<{ id: string }>(`SELECT id FROM ledger_accounts WHERE code = $1`, [code]);
    return res.rows[0]!.id;
  }

  it('posts a balanced manual entry to a real account', async () => {
    const [cash, payable] = await Promise.all([accountId('1000'), accountId('2000')]);
    const entryId = await rlsDb.run(SERVICE_CTX, (db) =>
      ledger.postManualEntry(db, {
        memo: 'ledger.spec.ts manual posting',
        entryDate: '2020-05-01',
        createdBy: financeAdminId,
        lines: [
          { accountId: cash, debitUgx: 400, creditUgx: 0 },
          { accountId: payable, debitUgx: 0, creditUgx: 400 },
        ],
      }),
    );
    expect(entryId).toBeTruthy();
  });

  it('rejects a direct posting to the synthetic Retained Earnings account (3000)', async () => {
    const [cash, retainedEarnings] = await Promise.all([accountId('1000'), accountId('3000')]);
    await expect(
      rlsDb.run(SERVICE_CTX, (db) =>
        ledger.postManualEntry(db, {
          memo: 'ledger.spec.ts direct posting to 3000',
          entryDate: '2020-05-01',
          createdBy: financeAdminId,
          lines: [
            { accountId: cash, debitUgx: 100, creditUgx: 0 },
            { accountId: retainedEarnings, debitUgx: 0, creditUgx: 100 },
          ],
        }),
      ),
    ).rejects.toThrow(/synthetic/i);
  });
});
