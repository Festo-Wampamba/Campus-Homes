/**
 * Batch room edits (Festo, 2026-10-23): many rooms renamed in one draft change
 * set, all or nothing, still reviewed by Ops like a single edit.
 */
import { Pool } from 'pg';

import { batchRoomUpdateSchema } from '@campushomes/shared';

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
let roomTypeId: string;

type Room = { id: string; roomCode: string };

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  return (await pool.query(sql, params)).rows[0]?.id as string;
}

async function stageRooms(codes: string[]): Promise<Room[]> {
  return (await rooms.bulkCreateRooms(landlordCtx, propertyId, {
    roomTypeId, roomCodes: codes, idempotencyKey: crypto.randomUUID(),
  })) as Room[];
}

async function stagedCode(room: Room): Promise<string> {
  return (await pool.query(`SELECT proposed_data->>'roomCode' AS code FROM room_unit_changes WHERE id = $1`, [room.id])).rows[0].code;
}

const asUpdate = (room: Room, roomCode: string) => ({ roomId: room.id, roomCode, roomTypeId, buildingName: null, floorLabel: null });

beforeAll(async () => {
  await pool.query(`TRUNCATE users, landlords, semesters, properties, room_types, room_inventory_change_sets CASCADE`);
  const landlordId = await seed(`INSERT INTO users (phone, role, status) VALUES ('+256710000700', 'landlord', 'active') RETURNING id`);
  const otherId = await seed(`INSERT INTO users (phone, role, status) VALUES ('+256710000701', 'landlord', 'active') RETURNING id`);
  await pool.query(
    `INSERT INTO landlords (user_id, legal_name, kyc_status) VALUES ($1, 'LL Batch', 'verified'), ($2, 'LL Other', 'verified')`,
    [landlordId, otherId],
  );
  propertyId = await seed(
    `INSERT INTO properties (landlord_id, name, street_address, status, catchment)
     VALUES ($1, 'Batch Hostel', 'Kikoni', 'active', 'MUK') RETURNING id`,
    [landlordId],
  );
  const semesterId = await seed(
    `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
     VALUES ('Sem Batch', '2026-08-01', '2026-12-15', '2026-11-15') RETURNING id`,
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

describe('batchUpdateRooms', () => {
  it('renames every room in the batch', async () => {
    const [a, b] = await stageRooms(['Old A', 'Old B']);

    const updated = (await rooms.batchUpdateRooms(landlordCtx, propertyId, {
      rooms: [asUpdate(a!, 'S1'), asUpdate(b!, 'S2')],
    })) as Room[];

    expect(updated.map((room) => room.roomCode).sort()).toEqual(['S1', 'S2']);
  });

  it('changes nothing when one room in the batch would clash', async () => {
    const [a, , c] = await stageRooms(['Keep A', 'Taken B', 'Other C']);
    await rooms.batchUpdateRooms(landlordCtx, propertyId, {
      rooms: [asUpdate(a!, 'Fresh A'), asUpdate(c!, 'Taken B')],
    }).catch(() => undefined);

    expect(await stagedCode(a!)).toBe('Keep A');
  });

  it("refuses rooms on another landlord's property", async () => {
    const [a] = await stageRooms(['Mine']);

    await expect(rooms.batchUpdateRooms(otherLandlordCtx, propertyId, { rooms: [asUpdate(a!, 'Theirs')] })).rejects.toThrow();
  });
});

describe('batchRoomUpdateSchema', () => {
  it('rejects two rooms given the same code', () => {
    const room = { roomTypeId: crypto.randomUUID(), roomCode: 'D1' };

    expect(batchRoomUpdateSchema.safeParse({
      rooms: [{ ...room, roomId: crypto.randomUUID() }, { ...room, roomId: crypto.randomUUID() }],
    }).success).toBe(false);
  });
});
