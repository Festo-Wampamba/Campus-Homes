/**
 * Deleting rooms (Festo, 2026-11-01): a staged room is discarded at once, an
 * approved room is staged for removal for Ops to review, all or nothing.
 */
import { Pool } from 'pg';

import { batchRoomDeleteSchema } from '@campushomes/shared';

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
let otherLandlordCtx: RlsContext;
let propertyId: string;
let semesterId: string;
let roomTypeId: string;

type Room = { id: string; roomCode: string; pendingRemoval?: boolean };

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  return (await pool.query(sql, params)).rows[0]?.id as string;
}

async function stageRooms(codes: string[]): Promise<Room[]> {
  return (await rooms.bulkCreateRooms(landlordCtx, propertyId, {
    roomTypeId, roomCodes: codes, idempotencyKey: crypto.randomUUID(),
  })) as Room[];
}

/** An approved room: a real unit with pricing, as Ops publish leaves it. */
async function approvedRoom(label: string): Promise<string> {
  const unitId = await seed(
    `INSERT INTO units (property_id, label, capacity, room_category, room_type_id)
     VALUES ($1, $2, 1, 'single', $3) RETURNING id`,
    [propertyId, label, roomTypeId],
  );
  await pool.query(
    `INSERT INTO unit_semester_pricing (unit_id, semester_id, price_per_term_ugx) VALUES ($1, $2, 800000)`,
    [unitId, semesterId],
  );
  return unitId;
}

async function listedRoom(id: string): Promise<Room | undefined> {
  const overview = await rooms.overview(landlordCtx, propertyId, semesterId);
  return (overview.rooms as Room[]).find((room) => room.id === id);
}

beforeAll(async () => {
  await pool.query(`TRUNCATE users, landlords, semesters, properties, room_types, room_inventory_change_sets CASCADE`);
  const landlordId = await seed(`INSERT INTO users (phone, role, status) VALUES ('+256710000800', 'landlord', 'active') RETURNING id`);
  const otherId = await seed(`INSERT INTO users (phone, role, status) VALUES ('+256710000801', 'landlord', 'active') RETURNING id`);
  await pool.query(
    `INSERT INTO landlords (user_id, legal_name, kyc_status) VALUES ($1, 'LL Delete', 'verified'), ($2, 'LL Other', 'verified')`,
    [landlordId, otherId],
  );
  propertyId = await seed(
    `INSERT INTO properties (landlord_id, name, street_address, status, catchment)
     VALUES ($1, 'Delete Hostel', 'Kikoni', 'active', 'MUK') RETURNING id`,
    [landlordId],
  );
  semesterId = await seed(
    `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
     VALUES ('Sem Delete', '2026-08-01', '2026-12-15', '2026-11-15') RETURNING id`,
  );
  landlordCtx = { userId: landlordId, role: 'landlord' };
  otherLandlordCtx = { userId: otherId, role: 'landlord' };
  const roomType = await rooms.createRoomType(landlordCtx, propertyId, {
    title: 'Single room', category: 'single', bathroomType: 'shared', capacity: 1, amenities: [],
    semesterId, pricePerTermUgx: 800000, photos: [],
  });
  roomTypeId = (roomType as { id: string }).id;
});

afterAll(async () => {
  await pool.end();
});

describe('deleteRooms', () => {
  it('discards a room that was only staged', async () => {
    const [room] = await stageRooms(['Staged 1']);

    await rooms.deleteRooms(landlordCtx, propertyId, { roomIds: [room!.id] });

    expect(await listedRoom(room!.id)).toBeUndefined();
  });

  it('marks an approved room for removal instead of deleting it', async () => {
    const unitId = await approvedRoom('Approved 1');

    await rooms.deleteRooms(landlordCtx, propertyId, { roomIds: [unitId] });

    expect((await listedRoom(unitId))?.pendingRemoval).toBe(true);
  });

  it("deletes nothing when one room in the batch isn't this landlord's", async () => {
    const [room] = await stageRooms(['Keep me']);
    await rooms.deleteRooms(landlordCtx, propertyId, { roomIds: [room!.id, crypto.randomUUID()] }).catch(() => undefined);

    expect(await listedRoom(room!.id)).toBeDefined();
  });

  it("refuses another landlord's property", async () => {
    const [room] = await stageRooms(['Mine too']);

    await expect(rooms.deleteRooms(otherLandlordCtx, propertyId, { roomIds: [room!.id] })).rejects.toThrow();
  });
});

describe('batchRoomDeleteSchema', () => {
  it('rejects the same room listed twice', () => {
    const id = crypto.randomUUID();

    expect(batchRoomDeleteSchema.safeParse({ roomIds: [id, id] }).success).toBe(false);
  });
});
