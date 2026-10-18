import { Readable } from 'node:stream';

import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';

/** One room as read from a landlord's spreadsheet. Room types are matched to
 * the property's own room types in the browser, where they are loaded. */
export type ImportedRoomRow = {
  rowNumber: number;
  roomCode: string;
  roomType: string;
  buildingName: string;
  floorLabel: string;
};

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

// Headers landlords already use in their own sheets, lowercased without
// punctuation. Extra columns (tenant names, payments) are ignored on purpose:
// student details never enter the system from a spreadsheet.
const HEADER_ALIASES: Record<keyof Omit<ImportedRoomRow, 'rowNumber'>, string[]> = {
  roomCode: ['room code', 'room', 'room no', 'room number', 'room num', 'code', 'room name', 'unit', 'door number'],
  roomType: ['room type', 'type', 'category', 'room category'],
  buildingName: ['building', 'block', 'wing', 'building block'],
  floorLabel: ['floor', 'level', 'floor level'],
};

const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Reads the first worksheet of an .xlsx file, or a CSV file, into room rows.
 * The format is detected from the bytes (an .xlsx file is a zip: "PK"). */
export async function parseRoomSheet(file: Buffer): Promise<ImportedRoomRow[]> {
  if (!Buffer.isBuffer(file) || file.length === 0) throw new BadRequestException('The file is empty');
  if (file.length > MAX_IMPORT_BYTES) throw new BadRequestException('The file is larger than 2 MB');

  const workbook = new ExcelJS.Workbook();
  let sheet: ExcelJS.Worksheet | undefined;
  try {
    if (file.subarray(0, 2).toString('latin1') === 'PK') {
      await workbook.xlsx.load(file as unknown as ArrayBuffer);
      sheet = workbook.worksheets[0];
    } else {
      sheet = await workbook.csv.read(Readable.from(file));
    }
  } catch {
    throw new BadRequestException('Could not read the file. Upload an Excel (.xlsx) or CSV file.');
  }
  if (!sheet) throw new BadRequestException('The file has no sheet');

  // Plain text only: cell.text is the displayed value, never a formula.
  const rows: { rowNumber: number; cells: string[] }[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = (cell.text ?? '').trim();
    });
    if (cells.some(Boolean)) rows.push({ rowNumber, cells });
  });

  const [header, ...data] = rows;
  if (!header) throw new BadRequestException('The file has no rows');
  const columns = Object.fromEntries(
    Object.entries(HEADER_ALIASES).map(([field, aliases]) => [
      field,
      header.cells.findIndex((cell) => aliases.includes(normalizeHeader(cell ?? ''))),
    ]),
  ) as Record<keyof typeof HEADER_ALIASES, number>;
  if (columns.roomCode < 0) {
    throw new BadRequestException('No "Room code" column found. Use the template, or name the column "Room code".');
  }
  if (data.length > MAX_IMPORT_ROWS) {
    throw new BadRequestException(`The file has ${data.length} rooms; upload at most ${MAX_IMPORT_ROWS} at a time.`);
  }

  const cell = (cells: string[], index: number) => (index >= 0 ? cells[index] ?? '' : '');
  return data.map(({ rowNumber, cells }) => ({
    rowNumber,
    roomCode: cell(cells, columns.roomCode),
    roomType: cell(cells, columns.roomType),
    buildingName: cell(cells, columns.buildingName),
    floorLabel: cell(cells, columns.floorLabel),
  }));
}

const TEMPLATE_HEADERS = ['Room code', 'Room type', 'Building', 'Floor'];

/** A ready-to-fill template using this property's own room type names. The
 * Excel version offers them as a dropdown on the Room type column. */
export async function roomImportTemplate(format: 'xlsx' | 'csv', roomTypeTitles: string[]) {
  const example = roomTypeTitles[0] ?? 'Single Room';
  const examples = [
    ['A01', example, 'Block A', 'Ground'],
    ['A02', example, 'Block A', 'Ground'],
  ];
  if (format === 'csv') {
    const quote = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
    const csv = [TEMPLATE_HEADERS, ...examples].map((row) => row.map(quote).join(',')).join('\r\n');
    return { buffer: Buffer.from(`${csv}\r\n`, 'utf8'), mimeType: 'text/csv; charset=utf-8', fileName: 'campushomes-rooms.csv' };
  }

  const workbook = new ExcelJS.Workbook();
  const rooms = workbook.addWorksheet('Rooms');
  rooms.addRow(TEMPLATE_HEADERS).font = { bold: true };
  examples.forEach((row) => rooms.addRow(row));
  rooms.columns.forEach((column) => { column.width = 22; });
  const types = workbook.addWorksheet('Room types');
  types.addRow(['Room types for this property']).font = { bold: true };
  roomTypeTitles.forEach((title) => types.addRow([title]));
  if (roomTypeTitles.length) {
    for (let row = 2; row <= MAX_IMPORT_ROWS + 1; row += 1) {
      rooms.getCell(`B${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`'Room types'!$A$2:$A$${roomTypeTitles.length + 1}`],
      };
    }
  }
  return {
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileName: 'campushomes-rooms.xlsx',
  };
}
