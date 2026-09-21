/**
 * Re-publish: an Ops Lead can re-open a verified listing and save edits
 * (rooms/prices/amenities). It must create a NEW immutable version, keep the
 * listing verified, carry the prior version's photos onto the new version
 * (rather than re-promoting the visit's staged photos), and update this
 * semester's unit pricing. Runs against the real docker test DB.
 */
import { Pool } from 'pg';

import { AuditService } from '../../src/modules/ops/audit.service';
import type { LogtoManagementClient } from '../../src/modules/auth/logto-management.client';
import { OpsService } from '../../src/modules/ops/ops.service';
import type { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { RlsDb } from '../../src/db/db.module';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const audit = new AuditService(rlsDb);
const ops = new OpsService(rlsDb, audit, {} as NotificationsService, {} as LogtoManagementClient);

let opsLeadId: string;
let listingId: string;
let semesterId: string;

const FULL_CHECKLIST = Object.fromEntries(
  ['location_gps', 'rooms_capacity', 'amenities', 'photos', 'landlord_identity', 'safety'].map((c) => [
    c,
    { passed: true },
  ]),
);

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  return (await pool.query(sql, params)).rows[0]?.id as string;
}

const leadCtx = () => ({ userId: opsLeadId, role: 'ops_lead' as const, mfaVerified: true });

beforeAll(async () => {
  await pool.query(
    `TRUNCATE users, students, landlords, ops_staff, semesters, properties,
     verification_visits, listings, listing_versions, units, beds, unit_semester_pricing,
     listing_photos, reservations CASCADE`,
  );
  const landlordId = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000090', 'landlord', 'active') RETURNING id`,
  );
  await pool.query(
    `INSERT INTO landlords (user_id, legal_name, kyc_status) VALUES ($1, 'LL Republish', 'verified')`,
    [landlordId],
  );
  opsLeadId = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000091', 'ops_lead', 'active') RETURNING id`,
  );
  const inspectorId = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000092', 'ops_inspector', 'active') RETURNING id`,
  );
  await pool.query(`INSERT INTO ops_staff (user_id, team) VALUES ($1, 'lead'), ($2, 'inspector')`, [
    opsLeadId,
    inspectorId,
  ]);
  await pool.query(
    `INSERT INTO user_role_assignments (user_id, role_id, scope_type, scope_id, assigned_by, reason)
     SELECT u.id, r.id, 'platform_wide', NULL, u.id, 'test fixture'
     FROM users u JOIN roles r ON r.key = u.role::text WHERE u.id IN ($1, $2)`,
    [opsLeadId, inspectorId],
  );
  const propertyId = await seed(
    `INSERT INTO properties (landlord_id, name, street_address, status, gps_lat, gps_lon, catchment)
     VALUES ($1, 'Republish Hostel', 'Wandegeya', 'active', 0.33, 32.57, 'MUK') RETURNING id`,
    [landlordId],
  );
  semesterId = await seed(
    `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
     VALUES ('Sem Republish', '2026-08-01', '2026-12-15', '2026-11-15') RETURNING id`,
  );
  await pool.query(
    `INSERT INTO verification_visits
       (property_id, inspector_id, checklist, client_idempotency_key, result, approved_by,
        approved_at, completed_at, visit_gps_lat, visit_gps_lon, photo_storage_keys)
     VALUES ($1, $2, $3, 'republish-visit', 'passed', $4, now(), now(), 0.33, 32.57, $5)`,
    [propertyId, inspectorId, JSON.stringify(FULL_CHECKLIST), opsLeadId, JSON.stringify([{ storageKey: 'photo-k1', category: 'bedroom' }])],
  );
  listingId = await seed(
    `INSERT INTO listings (property_id, semester_id, status) VALUES ($1, $2, 'pending_verification') RETURNING id`,
    [propertyId, semesterId],
  );

  // First publish — creates version 1, one unit at 500k, promotes the staged photo.
  await ops.publishListing(leadCtx(), {
    listingId,
    amenities: { water: true },
    description: 'Original',
    units: [{ label: 'Room 1', capacity: 1, roomCategory: 'single', pricePerTermUgx: 500_000 }],
  });
});

afterAll(async () => {
  await pool.end();
});

describe('OpsService.publishListing re-publish', () => {
  it('re-publishes a verified listing: new version, still verified, photo carried, price updated', async () => {
    const before = (
      await pool.query(`SELECT current_version_id, status FROM listings WHERE id = $1`, [listingId])
    ).rows[0] as { current_version_id: string; status: string };
    expect(before.status).toBe('verified');
    const unitId = (await pool.query(`SELECT id FROM units WHERE property_id = (SELECT property_id FROM listings WHERE id = $1)`, [listingId])).rows[0].id as string;

    await ops.publishListing(leadCtx(), {
      listingId,
      amenities: { water: true, wifi: true },
      description: 'Edited by lead',
      units: [{ unitId, label: 'Room 1', capacity: 1, roomCategory: 'single', pricePerTermUgx: 600_000 }],
    });

    const after = (
      await pool.query(`SELECT current_version_id, status FROM listings WHERE id = $1`, [listingId])
    ).rows[0] as { current_version_id: string; status: string };
    // Still verified, but pointing at a brand-new version.
    expect(after.status).toBe('verified');
    expect(after.current_version_id).not.toBe(before.current_version_id);

    // Price for this semester was updated (not ignored as a conflict).
    const price = (
      await pool.query(`SELECT price_per_term_ugx FROM unit_semester_pricing WHERE unit_id = $1 AND semester_id = $2`, [unitId, semesterId])
    ).rows[0].price_per_term_ugx;
    expect(Number(price)).toBe(600_000);

    // The prior version's photo was carried onto the new version (not lost, not duplicated from the visit).
    const newPhotos = (
      await pool.query(`SELECT count(*)::int AS n FROM listing_photos WHERE listing_version_id = $1`, [after.current_version_id])
    ).rows[0].n;
    expect(newPhotos).toBe(1);
  });

  it('deletes a room dropped from the re-publish payload', async () => {
    const propertyId = (
      await pool.query(`SELECT property_id FROM listings WHERE id = $1`, [listingId])
    ).rows[0].property_id as string;
    const room1 = (
      await pool.query(`SELECT id FROM units WHERE property_id = $1 ORDER BY label`, [propertyId])
    ).rows[0].id as string;

    // Add a second room.
    await ops.publishListing(leadCtx(), {
      listingId,
      amenities: { water: true },
      units: [
        { unitId: room1, label: 'Room 1', capacity: 1, roomCategory: 'single', pricePerTermUgx: 600_000 },
        { label: 'Room 2', capacity: 1, roomCategory: 'single', pricePerTermUgx: 400_000 },
      ],
    });
    expect(
      (await pool.query(`SELECT count(*)::int AS n FROM units WHERE property_id = $1`, [propertyId])).rows[0].n,
    ).toBe(2);

    // Re-publish without Room 2 — it should be deleted.
    await ops.publishListing(leadCtx(), {
      listingId,
      amenities: { water: true },
      units: [
        { unitId: room1, label: 'Room 1', capacity: 1, roomCategory: 'single', pricePerTermUgx: 600_000 },
      ],
    });
    expect(
      (await pool.query(`SELECT count(*)::int AS n FROM units WHERE property_id = $1`, [propertyId])).rows[0].n,
    ).toBe(1);
  });

  it('refuses to delete a room that has a reservation', async () => {
    const propertyId = (
      await pool.query(`SELECT property_id FROM listings WHERE id = $1`, [listingId])
    ).rows[0].property_id as string;
    const room1 = (
      await pool.query(`SELECT id FROM units WHERE property_id = $1 ORDER BY label`, [propertyId])
    ).rows[0].id as string;

    // Add Room 2 back so the payload can keep >=1 room while we try to drop Room 1.
    await ops.publishListing(leadCtx(), {
      listingId,
      amenities: { water: true },
      units: [
        { unitId: room1, label: 'Room 1', capacity: 1, roomCategory: 'single', pricePerTermUgx: 600_000 },
        { label: 'Room 2', capacity: 1, roomCategory: 'single', pricePerTermUgx: 400_000 },
      ],
    });
    const room2 = (
      await pool.query(`SELECT id FROM units WHERE property_id = $1 AND id <> $2`, [propertyId, room1])
    ).rows[0].id as string;

    // Reserve a bed in Room 1.
    const studentUserId = (
      await pool.query(`INSERT INTO users (phone, role, status) VALUES ('+256710000099', 'student', 'active') RETURNING id`)
    ).rows[0].id as string;
    await pool.query(`INSERT INTO students (user_id, university) VALUES ($1, 'MUK')`, [studentUserId]);
    const bed1 = (await pool.query(`SELECT id FROM beds WHERE unit_id = $1 LIMIT 1`, [room1])).rows[0].id as string;
    const versionId = (
      await pool.query(`SELECT current_version_id FROM listings WHERE id = $1`, [listingId])
    ).rows[0].current_version_id as string;
    await pool.query(
      `INSERT INTO reservations (student_id, bed_id, listing_version_id, status, idempotency_key, price_per_term_ugx)
       VALUES ($1, $2, $3, 'reserved', 'republish-res-01', 600000)`,
      [studentUserId, bed1, versionId],
    );

    // Trying to drop the reserved Room 1 is refused, and it survives.
    await expect(
      ops.publishListing(leadCtx(), {
        listingId,
        amenities: { water: true },
        units: [
          { unitId: room2, label: 'Room 2', capacity: 1, roomCategory: 'single', pricePerTermUgx: 400_000 },
        ],
      }),
    ).rejects.toThrow(/reservations/i);
    expect(
      (await pool.query(`SELECT count(*)::int AS n FROM units WHERE id = $1`, [room1])).rows[0].n,
    ).toBe(1);
  });
});
