/**
 * FinanceReportsService.profitLoss/balanceSheet against the real docker test
 * DB. Entries are hand-seeded into a fixed 2020 window that nothing else in
 * the suite ever touches (every other ledger-posting test defaults to
 * today's date) — journal_entries/journal_lines are append-only, so
 * date-scoping is the isolation mechanism instead of TRUNCATE.
 *
 * Re-runs stay idempotent by clearing exactly this suite's own 2020 window
 * first (journal_lines cascade with their entry; no other suite writes there)
 * and upserting its two toggle accounts back to active — otherwise a second
 * run double-posts every fixture and collides on ledger_accounts_code_uk.
 */
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import { FinanceReportsService } from '../../src/modules/finance/finance-reports.service';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const reports = new FinanceReportsService(rlsDb);

afterAll(async () => {
  await pool.end();
});

async function accountId(code: string): Promise<string> {
  const res = await pool.query<{ id: string }>(`SELECT id FROM ledger_accounts WHERE code = $1`, [code]);
  return res.rows[0]!.id;
}

beforeAll(async () => {
  await pool.query(
    `DELETE FROM journal_entries WHERE entry_date >= '2020-01-01' AND entry_date < '2021-01-01'`,
  );
  await pool.query(`UPDATE ledger_accounts SET is_active = true WHERE code IN ('5901', '1901')`);

  const [cash, revenue, refunds, expense, payable] = await Promise.all([
    accountId('1000'),
    accountId('4000'),
    accountId('4900'),
    accountId('5000'),
    accountId('2000'),
  ]);

  async function postEntry(entryDate: string, memo: string, lines: [string, number, number][]) {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO journal_entries (entry_date, memo, source_type) VALUES ($1, $2, 'manual') RETURNING id`,
      [entryDate, memo],
    );
    const entryId = rows[0]!.id;
    const values = lines.map((_, i) => `($1, $${i * 3 + 2}, $${i * 3 + 3}, $${i * 3 + 4})`).join(', ');
    const params = [entryId, ...lines.flatMap(([acct, debit, credit]) => [acct, debit, credit])];
    await pool.query(
      `INSERT INTO journal_lines (entry_id, account_id, debit_ugx, credit_ugx) VALUES ${values}`,
      params,
    );
  }

  // Month 1: a hold fee.
  await postEntry('2020-01-15', 'test hold fee 1', [
    [cash, 5000, 0],
    [revenue, 0, 5000],
  ]);
  // Month 2: another hold fee, a refund, and a manually recorded expense.
  await postEntry('2020-02-10', 'test hold fee 2', [
    [cash, 8000, 0],
    [revenue, 0, 8000],
  ]);
  await postEntry('2020-02-11', 'test refund', [
    [refunds, 2000, 0],
    [cash, 0, 2000],
  ]);
  await postEntry('2020-02-12', 'test operating expense', [
    [expense, 3000, 0],
    [payable, 0, 3000],
  ]);

  // Deactivation-after-posting fixture, dated April so it can't shift the
  // Jan/Feb assertions above (profitLoss is range-bound; balanceSheet is
  // cumulative-as-of, so April entries stay invisible to the Feb asOf too).
  async function createAccount(code: string, name: string, accountType: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO ledger_accounts (code, name, account_type, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (code) DO UPDATE SET name = $2, account_type = $3, is_active = true
       RETURNING id`,
      [code, name, accountType],
    );
    return rows[0]!.id;
  }
  const deactivatedExpense = await createAccount('5901', 'Test Deactivated Expense', 'expense');
  const deactivatedAsset = await createAccount('1901', 'Test Deactivated Asset', 'asset');
  await postEntry('2020-04-05', 'test expense on later-deactivated account', [
    [deactivatedExpense, 1500, 0],
    [payable, 0, 1500],
  ]);
  await postEntry('2020-04-06', 'test asset on later-deactivated account', [
    [deactivatedAsset, 700, 0],
    [payable, 0, 700],
  ]);
  await pool.query(`UPDATE ledger_accounts SET is_active = false WHERE id IN ($1, $2)`, [
    deactivatedExpense,
    deactivatedAsset,
  ]);
});

describe('FinanceReportsService.profitLoss', () => {
  it('sums revenue and expense accounts over the range with correct sign conventions', async () => {
    const report = await reports.profitLoss('2020-01-01', '2020-02-29');
    const byCode = Object.fromEntries(report.revenue.concat(report.expenses).map((r) => [r.accountCode, r.amountUgx]));
    expect(byCode['4000']).toBe(13000); // hold fees: 5000 + 8000
    expect(byCode['4900']).toBe(-2000); // contra-revenue: credit - debit = 0 - 2000
    expect(byCode['5000']).toBe(3000); // expense natural balance: debit - credit
    expect(report.totalRevenueUgx).toBe(11000); // 13000 - 2000
    expect(report.totalExpensesUgx).toBe(3000);
    expect(report.netIncomeUgx).toBe(8000);
  });

  it('still reports an account that was deactivated after entries were posted in the period', async () => {
    const report = await reports.profitLoss('2020-04-01', '2020-04-30');
    const byCode = Object.fromEntries(report.expenses.map((r) => [r.accountCode, r.amountUgx]));
    expect(byCode['5901']).toBe(1500);
    expect(report.totalExpensesUgx).toBe(1500);
  });
});

describe('FinanceReportsService.balanceSheet', () => {
  it('computes asset/liability/equity balances and stays balanced', async () => {
    const sheet = await reports.balanceSheet('2020-02-29');
    const cashLine = sheet.assets.find((a) => a.accountCode === '1000');
    const payableLine = sheet.liabilities.find((l) => l.accountCode === '2000');
    const retainedEarnings = sheet.equity.find((e) => e.accountCode === '3000');

    expect(cashLine?.amountUgx).toBe(11000); // 5000 + 8000 - 2000
    expect(payableLine?.amountUgx).toBe(3000);
    // Retained Earnings is synthetic — it must equal the same net income
    // profitLoss() computes for the same period, not a real journal balance.
    expect(retainedEarnings?.amountUgx).toBe(8000);

    expect(sheet.assetsTotalUgx).toBe(sheet.liabilitiesTotalUgx + sheet.equityTotalUgx);
    expect(sheet.meta.balanced).toBe(true);
  });

  it('stays balanced when an asset account was deactivated after its balancing entry posted', async () => {
    // Without the fix, the deactivated asset line drops out of `assets`
    // while its balancing credit to the still-active payable account stays
    // in `liabilities` — assetsTotal no longer equals liabilities + equity.
    const sheet = await reports.balanceSheet('2020-04-30');
    const deactivatedLine = sheet.assets.find((a) => a.accountCode === '1901');
    expect(deactivatedLine?.amountUgx).toBe(700);
    expect(sheet.assetsTotalUgx).toBe(sheet.liabilitiesTotalUgx + sheet.equityTotalUgx);
    expect(sheet.meta.balanced).toBe(true);
  });
});
