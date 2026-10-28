import ExcelJS from 'exceljs';

/** One row of the landlord's tenant ledger, as landlordTenants() returns it. */
export type TenantExportRow = {
  propertyName: string;
  roomLabel: string;
  bedLabel: string;
  status: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  totalUgx: number;
  paidUgx: number;
  balanceUgx: number;
};

const COLUMNS = [
  { header: 'Property', key: 'property', width: 26 },
  { header: 'Room', key: 'room', width: 14 },
  { header: 'Bed', key: 'bed', width: 10 },
  { header: 'Status', key: 'status', width: 12 },
  { header: 'Name', key: 'name', width: 24 },
  { header: 'Phone', key: 'phone', width: 18 },
  { header: 'Email', key: 'email', width: 28 },
  { header: 'Emergency contact', key: 'emergencyName', width: 22 },
  { header: 'Emergency phone', key: 'emergencyPhone', width: 18 },
  { header: 'Total (UGX)', key: 'total', width: 15 },
  { header: 'Paid (UGX)', key: 'paid', width: 15 },
  { header: 'Balance (UGX)', key: 'balance', width: 15 },
];
const MONEY = '#,##0';
// Brand teal-900 header with white text; balances still owed in red.
const HEADER_FILL = 'FF0F4C4F';
const OWED_RED = 'FFC0392B';

/** The tenant ledger as an Excel workbook (opens in Excel, LibreOffice,
 * Numbers and Google Sheets). Text cells stay text: exceljs never turns a
 * string starting with "=" into a formula, so typed names can't run. */
export async function tenantsWorkbook(tenants: TenantExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Tenants', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = COLUMNS;
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };

  for (const t of tenants) {
    const row = sheet.addRow({
      property: t.propertyName,
      room: t.roomLabel,
      bed: t.bedLabel,
      status: t.status === 'occupied' ? 'Moved in' : 'Booked',
      name: t.name ?? '',
      phone: t.phone ?? '',
      email: t.email ?? '',
      emergencyName: t.emergencyContactName ?? '',
      emergencyPhone: t.emergencyContactPhone ?? '',
      total: Number(t.totalUgx),
      paid: Number(t.paidUgx),
      balance: Number(t.balanceUgx),
    });
    if (Number(t.balanceUgx) > 0) row.getCell('balance').font = { bold: true, color: { argb: OWED_RED } };
  }

  if (tenants.length > 0) {
    const last = tenants.length + 1;
    const totals = sheet.addRow({
      name: 'Totals',
      total: { formula: `SUM(J2:J${last})` },
      paid: { formula: `SUM(K2:K${last})` },
      balance: { formula: `SUM(L2:L${last})` },
    });
    totals.font = { bold: true };
  }
  for (const key of ['total', 'paid', 'balance']) sheet.getColumn(key).numFmt = MONEY;
  sheet.autoFilter = { from: 'A1', to: 'L1' };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
