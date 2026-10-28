/**
 * Rooms template names (Festo, 2026-10-28): two room types with the same
 * title used to collapse into one dropdown entry, so the upload couldn't tell
 * them apart. Each room type now gets its own name in the template.
 */
import ExcelJS from 'exceljs';
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import type { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { AuditService } from '../../src/modules/ops/audit.service';
import { RoomManagementService } from '../../src/modules/room-management/room-management.service';
import { testDatabaseUrl } from '../test-database-url';

const pool = new Pool({ connectionString: testDatabaseUrl(), max: 5 });
const rlsDb = new RlsDb(pool);
const rooms = new RoomManagementService(rlsDb, new AuditService(rlsDb), {} as NotificationsService);

let landlordCtx: RlsContext;
let propertyId: string;
let semesterId: string;

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  return (await pool.query(sql, params)).rows[0]?.id as string;
}

beforeAll(async () => {
  await pool.query(`TRUNCATE users, landlords, semesters, properties, room_types, room_inventory_change_sets CASCADE`);
  const landlordId = await seed(`INSERT INTO users (phone, role, status) VALUES ('+256710000710', 'landlord', 'active') RETURNING id`);
  await pool.query(`INSERT INTO landlords (user_id, legal_name, kyc_status) VALUES ($1, 'LL Template', 'verified')`, [landlordId]);
  propertyId = await seed(
    `INSERT INTO properties (landlord_id, name, street_address, status, catchment)
     VALUES ($1, 'Template Hostel', 'Kikoni', 'active', 'MUK') RETURNING id`,
    [landlordId],
  );
  semesterId = await seed(
    `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
     VALUES ('Sem Template', '2026-08-01', '2026-12-15', '2026-11-15') RETURNING id`,
  );
  landlordCtx = { userId: landlordId, role: 'landlord' };
  for (const bathroomType of ['shared', 'ensuite'] as const) {
    await rooms.createRoomType(landlordCtx, propertyId, {
      title: 'Double Room', category: 'double', bathroomType, capacity: 2, amenities: [],
      semesterId, pricePerTermUgx: 1_200_000, photos: [],
    });
  }
});

afterAll(async () => {
  await pool.end();
});

it('names each of two same-titled room types apart in the Excel template', async () => {
  const file = await rooms.importTemplate(landlordCtx, propertyId, 'xlsx', semesterId);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file.buffer as unknown as ArrayBuffer);
  const names = workbook.getWorksheet('Room types')!.getColumn(1).values.slice(2);

  expect(names).toEqual(['Double Room - self-contained', 'Double Room - shared bathroom']);
});
