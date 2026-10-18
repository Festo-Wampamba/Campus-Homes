import { BadRequestException } from '@nestjs/common';

import { MAX_IMPORT_ROWS, parseRoomSheet, roomImportTemplate } from './room-import';

const csv = (text: string) => Buffer.from(text, 'utf8');

describe('parseRoomSheet', () => {
  it('reads a CSV using the headers landlords already use', async () => {
    const rows = await parseRoomSheet(csv('Room No,Type,Block,Level,Tenant\nB12,Double Room,Block B,1st,Jane\n'));
    expect(rows).toEqual([{ rowNumber: 2, roomCode: 'B12', roomType: 'Double Room', buildingName: 'Block B', floorLabel: '1st' }]);
  });

  it('reads back the Excel template it hands out', async () => {
    const template = await roomImportTemplate('xlsx', ['Single Room']);
    const rows = await parseRoomSheet(template.buffer);
    expect(rows.map((row) => [row.roomCode, row.roomType])).toEqual([['A01', 'Single Room'], ['A02', 'Single Room']]);
  });

  it('reads back the CSV template it hands out', async () => {
    const rows = await parseRoomSheet((await roomImportTemplate('csv', ['Quad, self-contained'])).buffer);
    expect(rows[0]!.roomType).toBe('Quad, self-contained');
  });

  it('skips blank rows', async () => {
    expect(await parseRoomSheet(csv('Room code\nA1\n,\nA2\n'))).toHaveLength(2);
  });

  it('asks for a Room code column when there is none', async () => {
    await expect(parseRoomSheet(csv('Name,Phone\nJane,0772\n'))).rejects.toThrow('No "Room code" column found');
  });

  it(`refuses more than ${MAX_IMPORT_ROWS} rooms at once`, async () => {
    const body = ['Room code', ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `R${i}`)].join('\n');
    await expect(parseRoomSheet(csv(body))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses an empty upload', async () => {
    await expect(parseRoomSheet(Buffer.alloc(0))).rejects.toThrow('The file is empty');
  });
});
