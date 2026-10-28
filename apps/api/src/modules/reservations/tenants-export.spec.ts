import ExcelJS from 'exceljs';

import { tenantsWorkbook, type TenantExportRow } from './tenants-export';

const TENANT: TenantExportRow = {
  propertyName: 'Mirembe Student Courts',
  roomLabel: 'A01',
  bedLabel: 'Bed 1',
  status: 'booked',
  name: 'Nambasa Gabi',
  phone: '+256761500153',
  email: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  totalUgx: 7_500_000,
  paidUgx: 1_000_000,
  balanceUgx: 6_500_000,
};

async function tenantsSheet(rows: TenantExportRow[]) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await tenantsWorkbook(rows)) as unknown as ArrayBuffer);
  return workbook.getWorksheet('Tenants')!;
}

it('writes the balance as a number a spreadsheet can add up', async () => {
  expect((await tenantsSheet([TENANT])).getCell('L2').value).toBe(6_500_000);
});

it('keeps the phone number as text so its leading + survives', async () => {
  expect((await tenantsSheet([TENANT])).getCell('F2').value).toBe('+256761500153');
});

it('keeps a name that looks like a formula as plain text', async () => {
  expect((await tenantsSheet([{ ...TENANT, name: '=HYPERLINK("x")' }])).getCell('E2').value).toBe('=HYPERLINK("x")');
});

it('adds a totals row that sums the balances', async () => {
  expect((await tenantsSheet([TENANT])).getCell('L3').value).toMatchObject({ formula: 'SUM(L2:L2)' });
});
