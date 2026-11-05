import { Pool } from 'pg';
import { UNIT_BLOCK_REASONS } from '@campushomes/shared';
import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import type { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { AuditService } from '../../src/modules/ops/audit.service';
import { RoomManagementService } from '../../src/modules/room-management/room-management.service';
import { testDatabaseUrl } from '../test-database-url';

const pool = new Pool({ connectionString: testDatabaseUrl(), max: 5 });
const rls = new RlsDb(pool);
const service = new RoomManagementService(rls, new AuditService(rls), {} as NotificationsService);
let ctx: RlsContext;
let propertyId: string;
let semesterId: string;
let unitId: string;
let otherUnitId: string;
const at = (offset: number) => new Date(Date.now() + offset).toISOString();
const overview = () => service.overview(ctx, propertyId, semesterId);

beforeAll(async () => {
  await pool.query('TRUNCATE users,landlords,semesters,properties,room_types,room_inventory_change_sets CASCADE');
  const userId = (await pool.query(`INSERT INTO users(phone,role,status) VALUES ('+256710000920','landlord','active') RETURNING id`)).rows[0].id;
  ctx = { userId, role: 'landlord' };
  await pool.query(`INSERT INTO landlords(user_id,legal_name,kyc_status) VALUES ($1,'Block fixture','verified')`, [userId]);
  propertyId = (await pool.query(`INSERT INTO properties(landlord_id,name,street_address,status,catchment,listing_intent) VALUES ($1,'Block fixture','Kikoni','active','MUK','manage_only') RETURNING id`, [userId])).rows[0].id;
  await rls.run({ ...ctx, role: 'service_role' }, async (_db, client) => { await client.query(`UPDATE properties SET manage_review_status='approved' WHERE id=$1`, [propertyId]); });
  semesterId = (await pool.query(`INSERT INTO semesters(name,starts_on,ends_on,re_verification_window_starts_on) VALUES ('Block semester','2026-08-01','2026-12-15','2026-11-15') RETURNING id`)).rows[0].id;
  const type = await service.createRoomType(ctx, propertyId, { title: 'Double', category: 'double', bathroomType: 'shared', capacity: 2, amenities: [], semesterId, pricePerTermUgx: 800000, photos: [] });
  const rooms = await service.bulkCreateRooms(ctx, propertyId, { roomTypeId: type.id, roomCodes: ['A10', 'A13'], idempotencyKey: crypto.randomUUID() });
  unitId = rooms.find((r) => r.roomCode === 'A10')!.id;
  otherUnitId = rooms.find((r) => r.roomCode === 'A13')!.id;
});
afterAll(() => pool.end());
afterEach(async () => { await pool.query(`UPDATE unit_blocks SET cleared_at=now() WHERE unit_id IN ($1,$2) AND cleared_at IS NULL`, [unitId, otherUnitId]); });

it.each(UNIT_BLOCK_REASONS)('applies and clears %s for one room only, keeping counts correct after reload', async (reason) => {
  const block = await service.blockRoom(ctx, unitId, { reason, startImmediately: true, startsAt: at(-10800000), endsAt: null });
  expect(block.room.id).toBe(unitId);
  expect(block.room.derivedStatus).toBe('blocked');
  expect(new Date(block.startsAt).getTime()).toBeGreaterThan(Date.now() - 10000);
  const snapshot = await overview();
  expect(snapshot.summary.blockedRooms).toBe(1);
  expect(snapshot.summary.availableBeds).toBe(2);
  expect(snapshot.rooms.find((r) => r.id === otherUnitId)?.activeBlock).toBeNull();
  expect(snapshot.rooms.find((r) => r.id === otherUnitId)?.derivedStatus).toBe('available');
  const cleared = await service.clearBlock(ctx, unitId, block.id);
  expect(cleared.room.derivedStatus).toBe('available');
  expect((await overview()).summary.blockedRooms).toBe(0);
});

it('rejects expired or reversed end times without recording a block', async () => {
  await expect(service.blockRoom(ctx, unitId, { reason: 'maintenance', startsAt: at(-10800000), endsAt: at(-60000) })).rejects.toThrow('end time');
  await expect(service.blockRoom(ctx, unitId, { reason: 'maintenance', startsAt: at(7200000), endsAt: at(3600000) })).rejects.toThrow('end time');
  expect((await overview()).summary.blockedRooms).toBe(0);
});

it.each([false, true])('shows scheduled blocks and handles activation/cancellation (activate=%s)', async (activate) => {
  const block = await service.blockRoom(ctx, unitId, { reason: 'renovation', startsAt: at(3600000), endsAt: at(7200000) });
  expect(block.room.activeBlock).toBeNull();
  expect(block.room.scheduledBlocks.map((b) => b.id)).toContain(block.id);
  expect((await overview()).summary.blockedRooms).toBe(0);
  if (activate) {
    await pool.query(`UPDATE unit_blocks SET starts_at=now()-interval '1 minute' WHERE id=$1`, [block.id]);
    expect((await overview()).summary.blockedRooms).toBe(1);
  }
  const cleared = await service.clearBlock(ctx, unitId, block.id);
  expect(cleared.room.scheduledBlocks).toHaveLength(0);
  expect(cleared.room.activeBlock).toBeNull();
});

it('enforces overlapping blocks per room, including concurrent requests', async () => {
  const input = { reason: 'maintenance' as const, startImmediately: true, startsAt: at(0), endsAt: null };
  const results = await Promise.allSettled([service.blockRoom(ctx, unitId, input), service.blockRoom(ctx, unitId, input)]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  await expect(service.blockRoom(ctx, otherUnitId, input)).resolves.toMatchObject({ unitId: otherUnitId });
  const block = (await overview()).rooms.find((r) => r.id === unitId)!.activeBlock!;
  await expect(service.clearBlock(ctx, otherUnitId, block.id)).rejects.toThrow('not found');
  await expect(service.blockRoom({ userId: crypto.randomUUID(), role: 'landlord' }, unitId, input)).rejects.toThrow('your property');
});

it('automatically expires a timed block without changing other rooms', async () => {
  const block = await service.blockRoom(ctx, unitId, { reason: 'safety', startsAt: at(-60000), endsAt: at(3600000) });
  await pool.query(`UPDATE unit_blocks SET starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' WHERE id=$1`, [block.id]);
  const snapshot = await overview();
  expect(snapshot.summary.blockedRooms).toBe(0);
  expect(snapshot.summary.availableBeds).toBe(4);
  expect(snapshot.rooms.find((r) => r.id === unitId)?.activeBlock).toBeNull();
});
