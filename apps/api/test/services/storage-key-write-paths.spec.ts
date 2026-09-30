/**
 * Every server write path that persists a caller-supplied storage key must
 * accept only objects the caller uploaded through /uploads/sign. On B2 the
 * value stored is the full public object URL, which the room-type photo check
 * used to reject outright (prefix-only comparison).
 */
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import type { LogtoManagementClient } from '../../src/modules/auth/logto-management.client';
import { LandlordsService } from '../../src/modules/landlords/landlords.service';
import { ListingsService } from '../../src/modules/listings/listings.service';
import { AuditService } from '../../src/modules/ops/audit.service';
import { OpsService } from '../../src/modules/ops/ops.service';
import { RoomManagementService } from '../../src/modules/room-management/room-management.service';
import type { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { AdminPropertiesService } from '../../src/modules/staff/admin-properties.service';

// This suite TRUNCATEs users CASCADE, so it must never fall back to a default database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must be set to a disposable database; this suite truncates tables');
}
process.env.DATABASE_URL ??= TEST_DATABASE_URL;
const ENDPOINT = 'https://s3.eu-central-003.backblazeb2.com';
const BUCKET = 'campushomes-media-production';
process.env.B2_S3_ENDPOINT = ENDPOINT;
process.env.B2_BUCKET = BUCKET;

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const listings = new ListingsService(rlsDb);
const audit = new AuditService(rlsDb);
const rooms = new RoomManagementService(rlsDb, audit, {} as NotificationsService);
const ops = new OpsService(rlsDb, audit, {} as NotificationsService, {} as LogtoManagementClient);
const landlordsService = new LandlordsService(rlsDb, audit);
const adminProperties = new AdminPropertiesService(rlsDb, audit);

let landlordCtx: RlsContext;
let otherUserId: string;
let inspectorId: string;
let pendingLandlordCtx: RlsContext;
let propertyId: string;
let semesterId: string;

const ownUrl = () => `${ENDPOINT}/${BUCKET}/uploads/${landlordCtx.userId}/${crypto.randomUUID()}`;
const inspectorCtx = (): RlsContext => ({ userId: inspectorId, role: 'ops_inspector', mfaVerified: true });
const ownInspectorKey = () => `uploads/${inspectorId}/${crypto.randomUUID()}`;
const foreignUrl = () => `${ENDPOINT}/${BUCKET}/uploads/${otherUserId}/${crypto.randomUUID()}`;

const LEGACY_ID_DOC = 'https://res.cloudinary.com/legacy/image/upload/id-doc.jpg';
const CHECKLIST = Object.fromEntries(
  ['location_gps', 'rooms_capacity', 'amenities', 'photos', 'landlord_identity', 'safety'].map((c) => [c, { passed: true }]),
);

const roomTypeInput = (photoKeys: string[]) => ({
  title: 'Single room',
  category: 'single' as const,
  bathroomType: 'shared' as const,
  capacity: 1,
  amenities: [],
  semesterId,
  pricePerTermUgx: 800000,
  photos: photoKeys.map((storageKey, sortOrder) => ({ storageKey, sortOrder, isPrimary: sortOrder === 0 })),
});

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  return (await pool.query(sql, params)).rows[0]?.id as string;
}

beforeAll(async () => {
  await pool.query(
    `TRUNCATE users, landlords, semesters, properties, room_types, room_inventory_change_sets CASCADE`,
  );
  const landlordId = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000600', 'landlord', 'active') RETURNING id`,
  );
  otherUserId = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000601', 'landlord', 'active') RETURNING id`,
  );
  await pool.query(`INSERT INTO landlords (user_id, legal_name, kyc_status) VALUES ($1, 'LL Keys', 'verified')`, [landlordId]);
  propertyId = await seed(
    `INSERT INTO properties (landlord_id, name, street_address, status, catchment)
     VALUES ($1, 'Keys Hostel', 'Wandegeya', 'active', 'MUK') RETURNING id`,
    [landlordId],
  );
  semesterId = await seed(
    `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
     VALUES ('Sem Keys', '2026-08-01', '2026-12-15', '2026-11-15') RETURNING id`,
  );
  landlordCtx = { userId: landlordId, role: 'landlord' };

  const pendingLandlordId = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000602', 'landlord', 'active') RETURNING id`,
  );
  await pool.query(
    `INSERT INTO landlords (user_id, legal_name, kyc_status, id_doc_storage_key)
     VALUES ($1, 'LL Pending Keys', 'pending', $2)`,
    [pendingLandlordId, LEGACY_ID_DOC],
  );
  pendingLandlordCtx = { userId: pendingLandlordId, role: 'landlord' };

  inspectorId = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000603', 'ops_inspector', 'active') RETURNING id`,
  );
  await pool.query(`INSERT INTO ops_staff (user_id, team, active) VALUES ($1, 'inspector', true)`, [inspectorId]);
  // app_staff_scope() (0035) grants staff RLS access from real role assignments.
  await pool.query(
    `INSERT INTO user_role_assignments (user_id, role_id, scope_type, scope_id, assigned_by, reason)
     SELECT u.id, r.id, 'platform_wide', NULL, u.id, 'test fixture'
     FROM users u JOIN roles r ON r.key = u.role::text WHERE u.id = $1`,
    [inspectorId],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('room type photos', () => {
  it('accepts the caller\'s own full B2 URL for a new room type', async () => {
    const key = ownUrl();
    const created = await rooms.createRoomType(landlordCtx, propertyId, roomTypeInput([key]));
    expect((created.pendingVersion ?? created.currentVersion)?.photos.map((p) => p.storageKey)).toEqual([key]);
  });

  it('rejects another user\'s B2 URL for a new room type', async () => {
    await expect(rooms.createRoomType(landlordCtx, propertyId, roomTypeInput([foreignUrl()]))).rejects.toThrow(
      'Room type photo does not belong to the signed-in uploader',
    );
  });

  it('rejects an arbitrary https URL for a new room type', async () => {
    await expect(
      rooms.createRoomType(landlordCtx, propertyId, roomTypeInput(['https://evil.example/x.jpg'])),
    ).rejects.toThrow('Room type photo does not belong to the signed-in uploader');
  });
});

describe('property gallery photos', () => {
  it('stores the caller\'s own upload', async () => {
    const key = ownUrl();
    const media = await listings.addPropertyMedia(landlordCtx, propertyId, key);
    expect(media?.storageKey).toBe(key);
  });

  it('rejects another user\'s upload', async () => {
    await expect(listings.addPropertyMedia(landlordCtx, propertyId, foreignUrl())).rejects.toThrow(
      'Attachment must be a file you uploaded',
    );
  });
});

describe('property cover photo', () => {
  it('rejects a new foreign cover photo on update', async () => {
    await expect(
      listings.updateProperty(landlordCtx, propertyId, { coverPhotoKey: 'https://evil.example/x.jpg' }),
    ).rejects.toThrow('Attachment must be a file you uploaded');
  });

  it('lets an already-stored cover photo be resubmitted unchanged', async () => {
    const legacy = 'https://res.cloudinary.com/legacy/image/upload/old.jpg';
    await pool.query(`UPDATE properties SET cover_photo_key = $2 WHERE id = $1`, [propertyId, legacy]);
    const updated = await listings.updateProperty(landlordCtx, propertyId, { coverPhotoKey: legacy, name: 'Keys Hostel 2' });
    expect(updated.coverPhotoKey).toBe(legacy);
  });
});

describe('visit sync photos', () => {
  const stagedKey = () => `uploads/${inspectorId}/${crypto.randomUUID()}`;

  async function seedVisit(staged: unknown[]): Promise<string> {
    return seed(
      `INSERT INTO verification_visits (property_id, inspector_id, client_idempotency_key, photo_storage_keys)
       VALUES ($1, $2, $3, $4::jsonb) RETURNING id`,
      [propertyId, inspectorId, `sync-keys-${crypto.randomUUID()}`, JSON.stringify(staged)],
    );
  }

  const sync = (visitId: string, photoStorageKeys: (string | { storageKey: string; category: 'bedroom' })[]) =>
    ops.syncVisit(inspectorCtx(), {
      clientIdempotencyKey: `sync-key-${crypto.randomUUID()}`,
      visitId,
      checklist: CHECKLIST as never,
      visitGpsLat: 0.33,
      visitGpsLon: 32.57,
      startedAt: new Date(Date.now() - 3600_000).toISOString(),
      completedAt: new Date().toISOString(),
      result: 'passed',
      photoStorageKeys,
    });

  it('accepts a resync that resubmits the already-staged keys', async () => {
    const legacy = 'https://res.cloudinary.com/legacy/image/upload/staged.jpg';
    const visitId = await seedVisit([legacy]);
    const visit = await sync(visitId, [legacy]);
    expect(visit.photoStorageKeys).toEqual([legacy]);
  });

  it('accepts a resync that adds the inspector\'s own new key', async () => {
    const visitId = await seedVisit([]);
    const key = ownInspectorKey();
    const visit = await sync(visitId, [key]);
    expect(visit.photoStorageKeys).toEqual([key]);
  });

  it('rejects a resync that adds another user\'s key', async () => {
    const visitId = await seedVisit([stagedKey()]);
    await expect(sync(visitId, [foreignUrl()])).rejects.toThrow('Attachment must be a file you uploaded');
  });

  it('treats the { storageKey, category } shape like the string shape for retained keys', async () => {
    const legacy = 'https://res.cloudinary.com/legacy/image/upload/staged-obj.jpg';
    const visitId = await seedVisit([{ storageKey: legacy, category: 'bedroom' }]);
    const visit = await sync(visitId, [{ storageKey: legacy, category: 'bedroom' }]);
    expect(visit.photoStorageKeys).toEqual([{ storageKey: legacy, category: 'bedroom' }]);
  });

  it('rejects a foreign key submitted in the { storageKey, category } shape', async () => {
    const visitId = await seedVisit([]);
    await expect(sync(visitId, [{ storageKey: foreignUrl(), category: 'bedroom' }])).rejects.toThrow(
      'Attachment must be a file you uploaded',
    );
  });

  it('treats a staged string key as retained when resubmitted as an object', async () => {
    const legacy = 'https://res.cloudinary.com/legacy/image/upload/staged-mixed.jpg';
    const visitId = await seedVisit([legacy]);
    const visit = await sync(visitId, [{ storageKey: legacy, category: 'bedroom' }]);
    expect(visit.photoStorageKeys).toEqual([{ storageKey: legacy, category: 'bedroom' }]);
  });
});

describe('admin property cover photo', () => {
  const staff = (): RlsContext => ({ userId: inspectorId, role: 'admin', mfaVerified: true });
  const legacy = 'https://res.cloudinary.com/legacy/image/upload/admin-cover.jpg';

  beforeEach(async () => {
    await pool.query(`UPDATE properties SET cover_photo_key = $2 WHERE id = $1`, [propertyId, legacy]);
  });

  it('accepts resubmitting the stored cover photo unchanged', async () => {
    await adminProperties.update(staff(), propertyId, { coverPhotoKey: legacy });
    const { rows } = await pool.query(`SELECT cover_photo_key FROM properties WHERE id = $1`, [propertyId]);
    expect(rows[0].cover_photo_key).toBe(legacy);
  });

  it('rejects replacing the cover photo with another user\'s key', async () => {
    await expect(adminProperties.update(staff(), propertyId, { coverPhotoKey: foreignUrl() })).rejects.toThrow(
      'Attachment must be a file you uploaded',
    );
  });

  it('accepts replacing the cover photo with the caller\'s own upload', async () => {
    const key = ownInspectorKey();
    await adminProperties.update(staff(), propertyId, { coverPhotoKey: key });
    const { rows } = await pool.query(`SELECT cover_photo_key FROM properties WHERE id = $1`, [propertyId]);
    expect(rows[0].cover_photo_key).toBe(key);
  });
});

describe('landlord ID document', () => {
  const profile = (idDocStorageKey: string) => ({
    legalName: 'LL Pending Keys',
    idDocStorageKey,
    businessType: 'individual_landlord' as const,
  });

  it('accepts resubmitting the stored ID document unchanged', async () => {
    const row = await landlordsService.upsertProfile(pendingLandlordCtx, profile(LEGACY_ID_DOC));
    expect(row?.idDocStorageKey).toBe(LEGACY_ID_DOC);
  });

  it('rejects replacing the ID document with another user\'s key', async () => {
    await expect(landlordsService.upsertProfile(pendingLandlordCtx, profile(foreignUrl()))).rejects.toThrow(
      'Attachment must be a file you uploaded',
    );
  });

  it('accepts replacing the ID document with the caller\'s own upload', async () => {
    const key = `uploads/${pendingLandlordCtx.userId}/${crypto.randomUUID()}`;
    const row = await landlordsService.upsertProfile(pendingLandlordCtx, profile(key));
    expect(row?.idDocStorageKey).toBe(key);
  });
});
