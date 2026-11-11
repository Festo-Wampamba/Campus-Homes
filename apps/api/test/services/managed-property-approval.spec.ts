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
    title: 'Single room', description: 'Additional shared single specification', category: 'single', bathroomType: 'shared', capacity: 1, amenities: [],
    semesterId, pricePerTermUgx: 800000, photos: [],
  });
  return (type as { id: string }).id;
}

/** Marks the property inspected and live. The verified-listing trigger
 * requires a lead-approved, fully-passed visit. */
async function verifiedListing(propertyId: string) {
  const checklist = JSON.stringify(Object.fromEntries(
    ['location_gps', 'rooms_capacity', 'amenities', 'photos', 'landlord_identity', 'safety'].map((c) => [c, { passed: true }]),
  ));
  await pool.query(
    `INSERT INTO ops_staff (user_id, team, active) VALUES ($1, 'inspector', true), ($2, 'lead', true) ON CONFLICT DO NOTHING`,
    [ids.inspector, ids.lead],
  );
  await pool.query(
    `INSERT INTO verification_visits (property_id, inspector_id, checklist, client_idempotency_key, result, approved_by, approved_at)
     VALUES ($1, $2, $3, $4, 'passed', $5, now())`,
    [propertyId, ids.inspector, checklist, `live-${propertyId}`, ids.lead],
  );
  await pool.query(`INSERT INTO listings (property_id, semester_id, status) VALUES ($1, $2, 'verified')`, [propertyId, semesterId]);
}

async function liveListedProperty(name: string) {
  const propertyId = await submit(name, 'list');
  await verifiedListing(propertyId);
  return propertyId;
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

  it('still creates the declared rooms after a cancelled draft room type', async () => {
    const propertyId = await submit('Cancelled Draft Hostel');
    await roomType(propertyId);
    await rooms.cancelChangeSet(landlordCtx, (await overview(propertyId)).changeSet!.id);

    await rooms.approveManagedProperty(opsLeadCtx, propertyId);

    expect((await overview(propertyId)).summary.totalRooms).toBe(5);
  });

  it('numbers variants that differ only by case as one sequence', async () => {
    const propertyId = (await listings.submitProperty(landlordCtx, {
      ...submitInput('Case Variant Hostel'),
      proposedRoomCategories: [
        { category: 'single', roomCount: 2, pricePerTermUgx: 800000, selfContained: false, variantName: 'Deluxe' },
        { category: 'single', roomCount: 2, pricePerTermUgx: 900000, selfContained: false, variantName: 'deluxe' },
      ],
    })).id;

    await rooms.approveManagedProperty(opsLeadCtx, propertyId);

    const codes = (await overview(propertyId)).rooms.map((room) => room.roomCode.toLowerCase());
    expect(new Set(codes).size).toBe(4);
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

  it('on a listed property not yet inspected wait for review', async () => {
    const propertyId = await submit('Listed Rooms Hostel', 'list');
    const typeId = await roomType(propertyId);

    const room = await rooms.createRoom(landlordCtx, propertyId, { roomTypeId: typeId, roomCode: 'L1' });

    expect(room.pendingChanges).toBe(true);
  });
});

// Festo, 2026-11-10: once a listed property has passed inspection and is
// live, its landlord's room changes need no second approval.
describe('room changes on a listed property with a live listing', () => {
  it('apply at once', async () => {
    const propertyId = await liveListedProperty('Live Add Hostel');
    const typeId = await roomType(propertyId);

    const room = await rooms.createRoom(landlordCtx, propertyId, { roomTypeId: typeId, roomCode: 'V1' });

    expect([room.pendingChanges ?? false, (await overview(propertyId)).changeSet]).toEqual([false, null]);
  });

  it('remove a room at once', async () => {
    const propertyId = await liveListedProperty('Live Delete Hostel');
    const typeId = await roomType(propertyId);
    const room = await rooms.createRoom(landlordCtx, propertyId, { roomTypeId: typeId, roomCode: 'V2' });

    const result = await rooms.deleteRooms(landlordCtx, propertyId, { roomIds: [room.id] });

    expect([result.applied, (await overview(propertyId)).summary.totalRooms]).toEqual([true, 0]);
  });

  it('tell the Ops lead covering the property what changed', async () => {
    const propertyId = await liveListedProperty('Live Notice Hostel');
    const typeId = await roomType(propertyId);
    const before = new Date();

    await rooms.createRoom(landlordCtx, propertyId, { roomTypeId: typeId, roomCode: 'V3' });

    const { rows } = await pool.query<{ user_id: string; message: string }>(
      `SELECT user_id, payload->>'message' AS message FROM notifications
       WHERE template_key = 'room_changes.applied' AND payload->>'propertyId' = $1 AND created_at >= $2`,
      [propertyId, before],
    );
    expect(rows).toEqual([{ user_id: ids.lead, message: expect.stringContaining('Live Notice Hostel: 1 room (new V3)') }]);
  });

  it('release changes that were sent for review before the listing went live', async () => {
    const propertyId = await submit('Waiting Live Hostel', 'list');
    const typeId = await roomType(propertyId);
    await rooms.createRoom(landlordCtx, propertyId, { roomTypeId: typeId, roomCode: 'V5' });
    await rooms.submitChangeSet(landlordCtx, (await overview(propertyId)).changeSet!.id);
    await verifiedListing(propertyId);

    const result = await overview(propertyId);

    expect([result.summary.totalRooms, result.changeSet]).toEqual([1, null]);
  });

  it('hand back waiting changes that can no longer apply instead of blocking the page', async () => {
    const propertyId = await liveListedProperty('Stuck Release Hostel');
    const typeId = await roomType(propertyId);
    const room = await rooms.createRoom(landlordCtx, propertyId, { roomTypeId: typeId, roomCode: 'V6' });
    // An archive that was waiting for Ops, for a room a student has since booked.
    const setId = await seed(
      `INSERT INTO room_inventory_change_sets(property_id, semester_id, submitted_by, status, submitted_at)
       VALUES ($1, $2, $3, 'pending_review', now()) RETURNING id`, [propertyId, semesterId, landlordCtx.userId]);
    await pool.query(
      `INSERT INTO room_unit_changes(change_set_id, action, unit_id, room_type_id, proposed_data, created_by)
       VALUES ($1, 'archive', $2, $3, '{}'::jsonb, $4)`, [setId, room.id, typeId, landlordCtx.userId]);
    const studentId = await seed(`INSERT INTO users (phone, role, status) VALUES ('+256710000950', 'student', 'active') RETURNING id`);
    await pool.query(`INSERT INTO students (user_id, university) VALUES ($1, 'MUK')`, [studentId]);
    const versionId = await seed(
      `INSERT INTO listing_versions (listing_id, version_number, price_per_term_ugx, amenities, verified_at)
       SELECT id, 1, 800000, '{}'::jsonb, now() FROM listings WHERE property_id = $1 RETURNING id`, [propertyId]);
    await pool.query(
      `INSERT INTO reservations (student_id, bed_id, listing_version_id, status, price_per_term_ugx, idempotency_key)
       SELECT $1, b.id, $3, 'booked', 800000, 'stuck-release' FROM beds b WHERE b.unit_id = $2 LIMIT 1`, [studentId, room.id, versionId]);

    const result = await overview(propertyId);

    expect([result.summary.totalRooms, result.changeSet?.status]).toEqual([1, 'rejected']);
  });

  it('apply a draft staged before the listing went live when it is submitted', async () => {
    const propertyId = await submit('Late Live Hostel', 'list');
    const typeId = await roomType(propertyId);
    await rooms.createRoom(landlordCtx, propertyId, { roomTypeId: typeId, roomCode: 'V4' });
    await verifiedListing(propertyId);

    const submitted = await rooms.submitChangeSet(landlordCtx, (await overview(propertyId)).changeSet!.id);

    expect(submitted.status).toBe('approved');
  });
});

describe('Ops visibility for listed properties', () => {
  it('alerts the responsible lead when a listed property is registered', async () => {
    const propertyId = await submit('New Listed Notice', 'list');
    const { rows } = await pool.query(`SELECT user_id, payload FROM notifications
      WHERE template_key='property.list_submitted' AND payload->>'propertyId'=$1`, [propertyId]);
    expect(rows.map((row) => row.user_id)).toEqual([ids.lead]);
    expect(rows[0]?.payload.href).toBe('/ops');
  });

  it('sends inspection requests only to reviewers covering the property', async () => {
    const propertyId = await submit('Inspection Notice', 'list');
    const typeId = await roomType(propertyId);
    await rooms.createRoom(landlordCtx, propertyId, { roomTypeId: typeId, roomCode: 'I01' });
    const setId = (await overview(propertyId)).changeSet!.id;
    await rooms.submitChangeSet(landlordCtx, setId);
    const { rows } = await pool.query(`SELECT user_id,payload FROM notifications
      WHERE template_key='room_changes.submitted' AND payload->>'changeSetId'=$1 AND user_id<>$2`, [setId, landlordCtx.userId]);
    expect(rows.map((row) => row.user_id)).toEqual([ids.lead]);
    expect(rows[0]?.payload.message).toContain('physical inspection');
    expect((await rooms.reviewQueue(opsLeadCtx)).some((item) => item.id === setId)).toBe(true);
    expect((await rooms.reviewQueue(kyuLeadCtx)).some((item) => item.id === setId)).toBe(false);
  });

  it('keeps applied room changes visible to the lead with before and after details', async () => {
    const propertyId = await liveListedProperty('Activity Notice');
    const typeId = await roomType(propertyId);
    const room = await rooms.createRoom(landlordCtx, propertyId, { roomTypeId: typeId, roomCode: 'OLD' });
    await rooms.updateRoom(landlordCtx, room.id, { roomTypeId: typeId, roomCode: 'NEW', buildingName: 'West' });
    const { rows } = await pool.query(`SELECT payload FROM notifications WHERE template_key='room_changes.applied'
      AND user_id=$1 AND payload->>'propertyId'=$2 ORDER BY created_at DESC`, [ids.lead, propertyId]);
    expect(rows[0]?.payload.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: expect.stringContaining('Room code'), before: 'OLD', after: 'NEW' }),
      expect.objectContaining({ label: expect.stringContaining('Building'), after: 'West' }),
    ]));
    expect(rows[0]?.payload.href).toBe('/ops/room-changes');
    expect(rows[0]?.payload.landlordName).toBeTruthy();
  });

  it('saves property photos immediately and alerts Ops without reopening approval', async () => {
    const propertyId = await liveListedProperty('Photo Notice');
    const photo = await listings.addPropertyMedia(landlordCtx, propertyId, `uploads/${landlordCtx.userId}/gallery.jpg`);
    await listings.removePropertyMedia(landlordCtx, photo!.id);
    const { rows } = await pool.query(`SELECT payload FROM notifications WHERE template_key='property.updated'
      AND user_id=$1 AND payload->>'propertyId'=$2 ORDER BY created_at`, [ids.lead, propertyId]);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.payload.message).join(' ')).toMatch(/photo/);
    expect((await pool.query(`SELECT status FROM listings WHERE property_id=$1`, [propertyId])).rows[0].status).toBe('verified');
  });
});

it('repairs a missed inspection notice once when the responsible lead opens notifications', async () => {
  const propertyId = await submit('Missed Inspection', 'list');
  const typeId = await roomType(propertyId);
  await rooms.createRoom(landlordCtx, propertyId, { roomTypeId: typeId, roomCode: 'M01' });
  const setId = (await overview(propertyId)).changeSet!.id;
  await rooms.submitChangeSet(landlordCtx, setId);
  await pool.query(`DELETE FROM notifications WHERE payload->>'changeSetId'=$1`, [setId]);
  await notifications.feedWithActions(opsLeadCtx, ['ops_lead']);
  await notifications.feedWithActions(opsLeadCtx, ['ops_lead']);
  await notifications.feedWithActions(kyuLeadCtx, ['ops_lead']);
  const { rows } = await pool.query(`SELECT user_id FROM notifications WHERE payload->>'changeSetId'=$1`, [setId]);
  expect(rows.map((row) => row.user_id)).toEqual([ids.lead]);
});

it('shows applied updates only to the active, MFA-verified reviewer in the current scope', async () => {
  const propertyId = await liveListedProperty('Scoped Activity');
  const typeId = await roomType(propertyId);
  await rooms.createRoom(landlordCtx, propertyId, { roomTypeId: typeId, roomCode: 'A01' });
  expect((await rooms.activity(opsLeadCtx)).some((item) => item.propertyId === propertyId)).toBe(true);
  expect(await rooms.activity({ ...opsLeadCtx, mfaVerified: false })).toEqual([]);
  expect(await rooms.activity(kyuLeadCtx)).toEqual([]);
});

it('keeps inspection mandatory for a new property from an existing landlord', async () => {
  const propertyId = await submit('Another New Property', 'list');
  const typeId = await roomType(propertyId);
  await rooms.createRoom(landlordCtx, propertyId, { roomTypeId: typeId, roomCode: 'F01' });
  const setId = (await overview(propertyId)).changeSet!.id;
  await rooms.submitChangeSet(landlordCtx, setId);
  await expect(rooms.approveChangeSet(opsLeadCtx, setId)).rejects.toThrow('physical verification');
});

it('notifies Ops of operational room and bed changes without an approval request', async () => {
  const propertyId = await liveListedProperty('Operational Notices');
  const typeId = await roomType(propertyId);
  const room = await rooms.createRoom(landlordCtx, propertyId, { roomTypeId: typeId, roomCode: 'O01' });
  await listings.updateUnitOperationalStatus(landlordCtx, room.id, 'under_maintenance');
  const block = await rooms.blockRoom(landlordCtx, room.id, { reason: 'maintenance', startImmediately: true, startsAt: new Date().toISOString() });
  await rooms.clearBlock(landlordCtx, room.id, block.id);
  const bedId = (await pool.query(`SELECT id FROM beds WHERE unit_id=$1 LIMIT 1`, [room.id])).rows[0].id;
  await rooms.blockBed(landlordCtx, room.id, bedId, { blocked: true, reason: 'Repairs' });
  const activity = (await rooms.activity(opsLeadCtx)).filter((item) => item.propertyId === propertyId);
  expect(activity).toHaveLength(6); // room type, room, status, block, unblock, bed block
  expect((await overview(propertyId)).changeSet).toBeNull();
});

it('does not borrow a global finance scope for a different scoped admin role', async () => {
  const actor = await seed(`INSERT INTO users(phone,role,status) VALUES ('+256710000905','admin','active') RETURNING id`);
  await pool.query(`INSERT INTO user_role_assignments(user_id,role_id,scope_type,scope_id,assigned_by,reason)
    SELECT $1,id,CASE WHEN key='platform_admin' THEN 'catchment' ELSE 'platform_wide' END,
      CASE WHEN key='platform_admin' THEN 'KYU' ELSE NULL END,$1,'Mixed role fixture'
    FROM roles WHERE key IN ('platform_admin','finance_admin')`, [actor]);
  const propertyId = await submit('Mixed Role Scope', 'list');
  const { rows } = await pool.query(`SELECT user_id FROM notifications
    WHERE payload->>'propertyId'=$1 AND template_key='property.list_submitted'`, [propertyId]);
  expect(rows.map((row) => row.user_id)).toEqual([ids.lead]);
  const typeId = await roomType(propertyId);
  await rooms.createRoom(landlordCtx, propertyId, { roomTypeId: typeId, roomCode: 'S01' });
  const setId = (await overview(propertyId)).changeSet!.id;
  await rooms.submitChangeSet(landlordCtx, setId);
  await notifications.feedWithActions({ userId: actor, role: 'admin', mfaVerified: true }, ['platform_admin','finance_admin']);
  const leaked = await pool.query(`SELECT 1 FROM notifications WHERE user_id=$1 AND payload->>'changeSetId'=$2`, [actor, setId]);
  expect(leaked.rows).toHaveLength(0);
});
