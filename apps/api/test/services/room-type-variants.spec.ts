import { Client, Pool } from 'pg';
import type { RoomTypeInput } from '@campushomes/shared';
import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import type { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { AuditService } from '../../src/modules/ops/audit.service';
import { RoomManagementService } from '../../src/modules/room-management/room-management.service';
import { testDatabaseUrl } from '../test-database-url';

const pool = new Pool({ connectionString: testDatabaseUrl(), max: 5 });
const rlsDb = new RlsDb(pool);
const service = new RoomManagementService(rlsDb, new AuditService(rlsDb), {} as NotificationsService);
let ctx: RlsContext;
let propertyId: string;
let input: RoomTypeInput;

beforeAll(async () => {
  await pool.query('TRUNCATE users, landlords, semesters, properties, room_types, room_inventory_change_sets CASCADE');
  const user = (await pool.query(`INSERT INTO users(phone,role,status) VALUES ('+256710000910','landlord','active') RETURNING id`)).rows[0].id;
  await pool.query(`INSERT INTO landlords(user_id,legal_name,kyc_status) VALUES ($1,'Variant owner','verified')`, [user]);
  propertyId = (await pool.query(`INSERT INTO properties(landlord_id,name,street_address,status,catchment,listing_intent,manage_review_status) VALUES ($1,'Variants','Kikoni','active','MUK','manage_only','approved') RETURNING id`, [user])).rows[0].id;
  await rlsDb.run({ userId: user, role: 'service_role' }, async (_db, client) => {
    await client.query(`UPDATE properties SET manage_review_status='approved' WHERE id=$1`, [propertyId]);
  });
  const semesterId = (await pool.query(`INSERT INTO semesters(name,starts_on,ends_on,re_verification_window_starts_on) VALUES ('Variants','2026-08-01','2026-12-15','2026-11-15') RETURNING id`)).rows[0].id;
  ctx = { userId: user, role: 'landlord' };
  input = { title: 'Single', category: 'single', bathroomType: 'shared', capacity: 1, amenities: [], semesterId, pricePerTermUgx: 800000, photos: [] };
});
afterAll(() => pool.end());

it('keeps same-name variants as distinct IDs and requires a distinguishing description on create and edit', async () => {
  const first = await service.createRoomType(ctx, propertyId, input);
  await expect(service.createRoomType(ctx, propertyId, { ...input, title: '  SINGLE  ' })).rejects.toThrow('description');
  const second = await service.createRoomType(ctx, propertyId, { ...input, title: 'single', description: 'Larger room with balcony', sizeSqm: 25, pricePerTermUgx: 1000000 });
  expect(second.id).not.toBe(first.id);
  expect(second.currentVersion?.sizeSqm).toBe(25);
  expect(first.currentVersion?.pricePerTermUgx).toBe(800000);
  await expect(service.updateRoomType(ctx, second.id, { ...input, title: ' Single ' })).rejects.toThrow('description');
  await expect(service.createRoomType(ctx, propertyId, { ...input, description: '  LARGER room with balcony  ' })).rejects.toThrow('description');
  const saved = await service.updateRoomType(ctx, second.id, { ...input, description: 'Balcony and a reading desk', pricePerTermUgx: 1100000 });
  expect(saved.id).toBe(second.id);
  expect((await service.roomType(ctx, first.id)).currentVersion?.pricePerTermUgx).toBe(800000);
});

it('serializes concurrent duplicate creation', async () => {
  const results = await Promise.allSettled([0, 1].map(() => service.createRoomType(ctx, propertyId, { ...input, title: 'Concurrent' })));
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
});

it('loads 100 live rooms with bounded inventory queries and preserves bed/block state', async () => {
  const type = await service.createRoomType(ctx, propertyId, { ...input, title: 'Performance' });
  await service.bulkCreateRooms(ctx, propertyId, { roomTypeId: type.id, roomCodes: Array.from({ length: 100 }, (_, i) => `P${i}`), idempotencyKey: crypto.randomUUID() });
  await pool.query(`UPDATE beds SET blocked=true, blocked_reason='maintenance' WHERE id=(SELECT b.id FROM beds b JOIN units u ON u.id=b.unit_id WHERE u.room_type_id=$1 ORDER BY u.label LIMIT 1)`, [type.id]);
  await pool.query(`INSERT INTO unit_blocks(unit_id,reason,starts_at,created_by) SELECT id,'maintenance',now()-interval '1 minute',$2 FROM units WHERE room_type_id=$1 AND label='P1'`, [type.id, ctx.userId]);
  const query = jest.spyOn(Client.prototype, 'query');
  const started = performance.now();
  let overview: Awaited<ReturnType<typeof service.overview>>;
  try {
    overview = await service.overview(ctx, propertyId, input.semesterId);
    console.info(JSON.stringify({ inventoryBenchmark: { rooms: overview.rooms.length, queries: query.mock.calls.length, elapsedMs: Math.round(performance.now() - started) } }));
    // Query budget is independent of room and room-type count.
    expect(query.mock.calls.length).toBeLessThanOrEqual(24);
  } finally { query.mockRestore(); }
  expect(overview.rooms).toHaveLength(100);
  expect(overview.rooms.find((r) => r.roomCode === 'P0')?.beds[0]?.blocked).toBe(true);
  expect(overview.rooms.find((r) => r.roomCode === 'P1')?.activeBlock?.reason).toBe('maintenance');
  expect(overview.summary.blockedRooms).toBe(2);
  expect(overview.summary.availableBeds).toBe(98);
});

it('keeps auto-bridged approved specifications out of pendingVersion', async () => {
  const unit = (await pool.query(`INSERT INTO units(property_id,label,capacity,room_category) VALUES ($1,'Legacy double',2,'double') RETURNING id`, [propertyId])).rows[0].id;
  await pool.query(`INSERT INTO unit_semester_pricing(unit_id,semester_id,price_per_term_ugx) VALUES ($1,$2,900000)`, [unit, input.semesterId]);
  const overview = await service.overview(ctx, propertyId, input.semesterId);
  const bridged = overview.roomTypes.find((type) => type.currentVersion?.category === 'double');
  expect(bridged?.currentVersion).toBeTruthy();
  expect(bridged?.pendingVersion).toBeNull();
});
