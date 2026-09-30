/**
 * Every server write path that persists a caller-supplied storage key must
 * accept only objects the caller uploaded through /uploads/sign. On B2 the
 * value stored is the full public object URL, which the room-type photo check
 * used to reject outright (prefix-only comparison).
 */
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import { ListingsService } from '../../src/modules/listings/listings.service';
import { AuditService } from '../../src/modules/ops/audit.service';
import { RoomManagementService } from '../../src/modules/room-management/room-management.service';
import type { NotificationsService } from '../../src/modules/notifications/notifications.service';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';
process.env.DATABASE_URL ??= TEST_DATABASE_URL;
const ENDPOINT = 'https://s3.eu-central-003.backblazeb2.com';
const BUCKET = 'campushomes-media-production';
process.env.B2_S3_ENDPOINT = ENDPOINT;
process.env.B2_BUCKET = BUCKET;

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const listings = new ListingsService(rlsDb);
const rooms = new RoomManagementService(rlsDb, new AuditService(rlsDb), {} as NotificationsService);

let landlordCtx: RlsContext;
let otherUserId: string;
let propertyId: string;
let semesterId: string;

const ownUrl = () => `${ENDPOINT}/${BUCKET}/uploads/${landlordCtx.userId}/${crypto.randomUUID()}`;
const foreignUrl = () => `${ENDPOINT}/${BUCKET}/uploads/${otherUserId}/${crypto.randomUUID()}`;

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
