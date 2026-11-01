/**
 * Ops approval of manage-only properties (Festo, 2026-11-01): submitting one
 * alerts the Ops leads and inspectors covering it, Ops approves it once, and
 * from then on the landlord's room changes apply at once. Before approval
 * they still wait for review; listed properties keep the review flow.
 */
import { ForbiddenException } from '@nestjs/common';
import { Pool } from 'pg';

import { ConsoleMessaging } from '../../src/adapters/messaging.adapter';
import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import { ListingsService } from '../../src/modules/listings/listings.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { AuditService } from '../../src/modules/ops/audit.service';
import { RoomManagementService } from '../../src/modules/room-management/room-management.service';
import { testDatabaseUrl } from '../test-database-url';

const TEST_DATABASE_URL = testDatabaseUrl();
// Services call loadEnv(), which requires DATABASE_URL.
process.env.DATABASE_URL = process.env.DATABASE_URL || TEST_DATABASE_URL;

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const audit = new AuditService(rlsDb);
const notifications = new NotificationsService(rlsDb, new ConsoleMessaging());
const listings = new ListingsService(rlsDb, notifications, undefined, audit);
const rooms = new RoomManagementService(rlsDb, audit, notifications);

const submitInput = (name: string, listingIntent: 'manage_only' | 'list' = 'manage_only') => ({
  name,
  streetAddress: 'Kikoni',
  type: 'hostel' as const,
  catchment: 'MUK' as const,
  proposedRoomCategories: [
    { category: 'single' as const, roomCount: 3, pricePerTermUgx: 800000, selfContained: false },
    { category: 'double' as const, roomCount: 2, pricePerTermUgx: 600000, selfContained: true, variantName: 'Deluxe' },
  ],
  proposedAmenities: {},
  houseRules: [],
  otherCatchments: [],
  furnishingItems: {},
  securityFeatures: {},
  accessibilityFeatures: {},
  photographyConsent: false,
  rentPeriods: [],
  transportShuttle: false,
  advanceRentRequired: false,
  authorityRole: 'owner' as const,
  declaredInfoAccurate: true as const,
  declaredAuthorityOverProperty: true as const,
  declaredWillKeepUpdated: true as const,
  declaredAuthorizesPublish: listingIntent === 'list',
  declaredConsentToProcessing: true as const,
  listingIntent,
});

let landlordCtx: RlsContext;
let opsLeadCtx: RlsContext;
let kyuLeadCtx: RlsContext;
let ids: Record<'lead' | 'inspector' | 'kyuLead' | 'revokedLead', string>;
let semesterId: string;

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  return (await pool.query(sql, params)).rows[0]?.id as string;
}

async function staff(phone: string, role: string, scopeType: string, scopeId: string | null, revoked = false) {
  const userId = await seed(`INSERT INTO users (phone, role, status) VALUES ($1, $2, 'active') RETURNING id`, [phone, role]);
  await pool.query(
    `INSERT INTO user_role_assignments (user_id, role_id, scope_type, scope_id, assigned_by, reason, revoked_at)
     SELECT $1, r.id, $2, $3, $1, 'test fixture', $4 FROM roles r WHERE r.key = $5`,
    [userId, scopeType, scopeId, revoked ? new Date() : null, role],
  );
  return userId;
}

async function submit(name: string, intent: 'manage_only' | 'list' = 'manage_only') {
  return (await listings.submitProperty(landlordCtx, submitInput(name, intent))).id;
}

async function overview(propertyId: string) {
  return rooms.overview(landlordCtx, propertyId, semesterId);
}

/** A room type on the property, so rooms can be added to it. */
async function roomType(propertyId: string) {
  const type = await rooms.createRoomType(landlordCtx, propertyId, {
    title: 'Single room', category: 'single', bathroomType: 'shared', capacity: 1, amenities: [],
    semesterId, pricePerTermUgx: 800000, photos: [],
  });
  return (type as { id: string }).id;
}

beforeAll(async () => {
  await pool.query(
    `TRUNCATE users, landlords, semesters, properties, units, beds, room_types, room_inventory_change_sets CASCADE`,
  );
  const landlordId = await seed(`INSERT INTO users (phone, role, status) VALUES ('+256710000900', 'landlord', 'active') RETURNING id`);
  await pool.query(`INSERT INTO landlords (user_id, legal_name, kyc_status) VALUES ($1, 'LL Managed', 'verified')`, [landlordId]);
  ids = {
    lead: await staff('+256710000901', 'ops_lead', 'catchment', 'MUK'),
    inspector: await staff('+256710000902', 'ops_inspector', 'platform_wide', null),
    kyuLead: await staff('+256710000903', 'ops_lead', 'catchment', 'KYU'),
    revokedLead: await staff('+256710000904', 'ops_lead', 'platform_wide', null, true),
  };
  semesterId = await seed(
    `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
     VALUES ('Sem Managed', '2026-08-01', '2099-12-15', '2099-11-15') RETURNING id`,
  );
  landlordCtx = { userId: landlordId, role: 'landlord' };
  opsLeadCtx = { userId: ids.lead, role: 'ops_lead', mfaVerified: true };
  kyuLeadCtx = { userId: ids.kyuLead, role: 'ops_lead', mfaVerified: true };
});

afterAll(async () => {
  await pool.end();
});

describe('submitting a manage-only property', () => {
  it('alerts the Ops leads and inspectors whose scope covers it', async () => {
    const propertyId = await submit('Alert Hostel');

    const { rows } = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM notifications WHERE template_key = 'property.manage_submitted' AND payload->>'propertyId' = $1`,
      [propertyId],
    );

    expect(rows.map((row) => row.user_id).sort()).toEqual([ids.lead, ids.inspector].sort());
  });

  it('sends no alert for a property to be listed', async () => {
    const propertyId = await submit('Listed Hostel', 'list');

    const { rowCount } = await pool.query(
      `SELECT 1 FROM notifications WHERE template_key = 'property.manage_submitted' AND payload->>'propertyId' = $1`,
      [propertyId],
    );

    expect(rowCount).toBe(0);
  });

  it('puts it in the Ops approval list', async () => {
    const propertyId = await submit('Pending Hostel');

    const queue = (await rooms.managedPropertyQueue(opsLeadCtx)) as { id: string }[];

    expect(queue.map((row) => row.id)).toContain(propertyId);
  });
});

describe('the approval', () => {
  it("can't be set by the landlord on their own row", async () => {
    const propertyId = await submit('Self Approve Hostel');

    await rlsDb.run(landlordCtx, (_db, client) =>
      client.query(`UPDATE properties SET manage_review_status = 'approved' WHERE id = $1`, [propertyId]));

    const { rows } = await pool.query(`SELECT manage_review_status FROM properties WHERE id = $1`, [propertyId]);
    expect(rows[0].manage_review_status).toBe('pending');
  });

  it("is refused for a lead outside the property's catchment", async () => {
    const propertyId = await submit('Out Of Scope Hostel');

    await expect(rooms.approveManagedProperty(kyuLeadCtx, propertyId)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('turns the declared room types into rooms and beds', async () => {
    const propertyId = await submit('Declared Rooms Hostel');

    await rooms.approveManagedProperty(opsLeadCtx, propertyId);

    expect((await overview(propertyId)).summary).toMatchObject({ totalRooms: 5, totalBeds: 7 });
  });

  it('applies room changes that were waiting for review', async () => {
    const propertyId = await submit('Waiting Changes Hostel');
    const typeId = await roomType(propertyId);
    await rooms.createRoom(landlordCtx, propertyId, { roomTypeId: typeId, roomCode: 'W1' });
    await rooms.submitChangeSet(landlordCtx, (await overview(propertyId)).changeSet!.id);

    await rooms.approveManagedProperty(opsLeadCtx, propertyId);

    const live = (await overview(propertyId)).rooms.map((room) => [room.roomCode, room.pendingChanges ?? false]);
    expect(live).toEqual([['W1', false]]);
  });

  it('is sent back with a reason', async () => {
    const propertyId = await submit('Rejected Hostel');

    await rooms.rejectManagedProperty(opsLeadCtx, propertyId, 'The address does not match the map pin');

    const { rows } = await pool.query(
      `SELECT manage_review_status, manage_rejection_reason FROM properties WHERE id = $1`, [propertyId],
    );
    expect(rows[0]).toEqual({ manage_review_status: 'rejected', manage_rejection_reason: 'The address does not match the map pin' });
  });
});

describe('room changes', () => {
  it('wait for Ops review before the property is approved', async () => {
    const propertyId = await submit('Unapproved Hostel');
    const typeId = await roomType(propertyId);

    const room = await rooms.createRoom(landlordCtx, propertyId, { roomTypeId: typeId, roomCode: 'U1' });

    expect(room.pendingChanges).toBe(true);
  });

  it('apply at once after approval', async () => {
    const propertyId = await submit('Approved Hostel');
    await rooms.approveManagedProperty(opsLeadCtx, propertyId);
    const typeId = await roomType(propertyId);

    await rooms.bulkCreateRooms(landlordCtx, propertyId, {
      roomTypeId: typeId, roomCodes: ['A1', 'A2'], idempotencyKey: crypto.randomUUID(),
    });

    const result = await overview(propertyId);
    expect([result.summary.totalRooms, result.changeSet]).toEqual([7, null]);
  });

  it('remove a room at once after approval', async () => {
    const propertyId = await submit('Approved Delete Hostel');
    await rooms.approveManagedProperty(opsLeadCtx, propertyId);
    const [first] = (await overview(propertyId)).rooms;

    await rooms.deleteRooms(landlordCtx, propertyId, { roomIds: [first!.id] });

    expect((await overview(propertyId)).summary.totalRooms).toBe(4);
  });

  it('on a listed property still wait for review', async () => {
    const propertyId = await submit('Listed Rooms Hostel', 'list');
    const typeId = await roomType(propertyId);

    const room = await rooms.createRoom(landlordCtx, propertyId, { roomTypeId: typeId, roomCode: 'L1' });

    expect(room.pendingChanges).toBe(true);
  });
});
