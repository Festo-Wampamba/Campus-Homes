/**
 * Landlord inventory removal: apply immediately regardless of creator,
 * preserve history, and reject the whole deletion when any room has a live booking.
 */
import { Pool } from 'pg';

import { batchRoomDeleteSchema } from '@campushomes/shared';

import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import type { NotificationsService } from '../../src/modules/notifications/notifications.service';
import type { LogtoManagementClient } from '../../src/modules/auth/logto-management.client';
import { OpsService } from '../../src/modules/ops/ops.service';
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

  it('removes an Ops-created room immediately even before the property is published', async () => {
    const unitId = await approvedRoom('Approved 1');

    await rooms.deleteRooms(landlordCtx, propertyId, { roomIds: [unitId] });

    expect(await listedRoom(unitId)).toBeUndefined();
    expect((await pool.query('SELECT archived_at FROM units WHERE id=$1', [unitId])).rows[0].archived_at).not.toBeNull();
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


it('allows retrying an old pending room removal and cancels its empty request', async () => {
  const unitId = await approvedRoom('Old pending removal');
  // Reproduce a removal submitted under the old approval workflow.
  const oldSemester = await seed(`INSERT INTO semesters(name,starts_on,ends_on,re_verification_window_starts_on)
    VALUES ('Old removal semester','2025-01-01','2025-05-01','2025-04-01') RETURNING id`);
  const changeId = await seed(`INSERT INTO room_inventory_change_sets(property_id,semester_id,submitted_by,status)
    VALUES ($1,$2,$3,'pending_review') RETURNING id`, [propertyId,oldSemester,landlordCtx.userId]);
  await pool.query(`INSERT INTO room_unit_changes(change_set_id,unit_id,room_type_id,action,proposed_data)
    VALUES ($1,$2,$3,'archive','{}')`, [changeId,unitId,roomTypeId]);
  await rooms.deleteRooms(landlordCtx,propertyId,{roomIds:[unitId]});
  expect(await listedRoom(unitId)).toBeUndefined();
  expect((await pool.query('SELECT status FROM room_inventory_change_sets WHERE id=$1',[changeId])).rows[0].status).toBe('cancelled');
});

it('protects active tenants and rolls back the whole deletion, while keeping past booking history', async () => {
  const unusedId = await approvedRoom('Unused beside booked');
  const unitId = await approvedRoom('Booked Ops room');
  const bedId = await seed(`INSERT INTO beds(unit_id,label) VALUES ($1,'Bed 1') RETURNING id`,[unitId]);
  const studentId = await seed(`INSERT INTO users(phone,role,status) VALUES ('+256710000803','student','active') RETURNING id`);
  await pool.query(`INSERT INTO students(user_id,university) VALUES ($1,'MUK')`,[studentId]);
  const listingId = await seed(`INSERT INTO listings(property_id,semester_id,status) VALUES ($1,$2,'draft') RETURNING id`,[propertyId,semesterId]);
  const versionId = await seed(`INSERT INTO listing_versions(listing_id,version_number,price_per_term_ugx,amenities,verified_at)
    VALUES ($1,1,800000,'{}',now()) RETURNING id`,[listingId]);
  const reservationId = await seed(`INSERT INTO reservations(student_id,bed_id,listing_version_id,status,price_per_term_ugx,idempotency_key)
    VALUES ($1,$2,$3,'booked',800000,'type-delete-history') RETURNING id`,[studentId,bedId,versionId]);
  await expect(rooms.deleteRoomType(landlordCtx,roomTypeId)).rejects.toThrow('active reservation');
  await expect(rooms.deleteRooms(landlordCtx,propertyId,{roomIds:[unusedId,unitId]})).rejects.toThrow('active reservation');
  expect((await pool.query('SELECT archived_at FROM units WHERE id=$1',[unusedId])).rows[0].archived_at).toBeNull();
  expect((await pool.query('SELECT archived_at FROM room_types WHERE id=$1',[roomTypeId])).rows[0].archived_at).toBeNull();
  await pool.query(`UPDATE reservations SET status='cancelled' WHERE id=$1`,[reservationId]);
});

it('lets the owner delete an Ops-created room type and its unused rooms without review', async () => {
  const opsId = await seed(`INSERT INTO users(phone,role,status) VALUES ('+256710000802','ops_lead','active') RETURNING id`);
  await pool.query(`INSERT INTO user_role_assignments(user_id,role_id,scope_type,assigned_by,reason)
    SELECT $1,id,'platform_wide',$1,'Ops type deletion test' FROM roles WHERE key='ops_lead'`,[opsId]);
  await pool.query('UPDATE room_types SET created_by=$2 WHERE id=$1',[roomTypeId,opsId]);
  await pool.query(`UPDATE room_type_versions SET status='approved',change_set_id=NULL WHERE room_type_id=$1`,[roomTypeId]);
  await pool.query(`UPDATE room_types SET current_version_id=(SELECT id FROM room_type_versions WHERE room_type_id=$1 ORDER BY version_number DESC LIMIT 1) WHERE id=$1`,[roomTypeId]);
  const unitId = await approvedRoom('Ops type room');
  const service = rooms;
  await expect(service.deleteRoomType(otherLandlordCtx,roomTypeId)).rejects.toThrow();
  await service.deleteRoomType(landlordCtx,roomTypeId);
  const state = await rooms.overview(landlordCtx,propertyId,semesterId);
  expect(state.roomTypes.find((type)=>type.id===roomTypeId)).toBeUndefined();
  expect(state.rooms.find((room)=>room.id===unitId)).toBeUndefined();
  expect((await pool.query('SELECT archived_at FROM room_types WHERE id=$1',[roomTypeId])).rows[0].archived_at).not.toBeNull();
  expect((await rooms.overview(landlordCtx,propertyId,semesterId)).roomTypes).toHaveLength(0);
  expect((await pool.query(`SELECT 1 FROM reservations WHERE idempotency_key='type-delete-history'`)).rows).toHaveLength(1);
  const ops = new OpsService(rlsDb,new AuditService(rlsDb),{} as NotificationsService,{} as LogtoManagementClient);
  const listing = (await pool.query('SELECT id FROM listings WHERE property_id=$1 LIMIT 1',[propertyId])).rows[0];
  expect((await ops.listingForPublish({userId:opsId,role:'ops_lead',mfaVerified:true},listing.id)).inventoryInitialized).toBe(true);
  expect(await ops.propertyRooms({userId:opsId,role:'ops_lead',mfaVerified:true},propertyId,semesterId)).toEqual([]);
  expect((await pool.query(`SELECT 1 FROM notifications WHERE user_id=$1 AND template_key='room_changes.applied' AND payload->>'propertyId'=$2`,[opsId,propertyId])).rows).toHaveLength(1);
});
