/**
 * Regression coverage for a real bug: the public detail() availability
 * query only excluded units with a 'held' reservation, so a unit that was
 * 'payment_pending' or already 'fulfilled' (i.e. genuinely occupied) still
 * showed as available to a browsing student. search() had the same gap one
 * level up — unit_count/room_categories were computed from every unit on a
 * listing regardless of reservation status, and a fully-booked listing
 * still appeared in results with nothing actually reservable. Both now use
 * LIVE_RESERVATION_STATUSES ('held' | 'payment_pending' | 'fulfilled'),
 * matching the meeting requirement that occupied rooms never appear
 * available to students.
 */
import { Pool } from 'pg';

import { AuditService } from '../../src/modules/ops/audit.service';
import type { Auth } from '../../src/modules/auth/auth.config';
import { OpsService } from '../../src/modules/ops/ops.service';
import { RlsDb } from '../../src/db/db.module';
import { ListingsService } from '../../src/modules/listings/listings.service';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const audit = new AuditService(rlsDb);
// Only inviteLandlord() touches auth.api — unused by anything these tests exercise.
const ops = new OpsService(rlsDb, audit, {} as Auth);
const listings = new ListingsService(rlsDb);

let listingId: string;
let versionId: string;
let unitFulfilled: string;
let unitPending: string;
let unitCancelled: string;
let studentId: string;

const FULL_CHECKLIST = Object.fromEntries(
  ['location_gps', 'rooms_capacity', 'amenities', 'photos', 'landlord_identity', 'safety'].map(
    (c) => [c, { passed: true }],
  ),
) as Record<string, { passed: boolean }>;

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  const res = await pool.query(sql, params);
  return res.rows[0]?.id as string;
}

beforeAll(async () => {
  await pool.query(
    `TRUNCATE users, students, landlords, ops_staff, semesters, properties,
     verification_visits, listings, listing_versions, units, reservations CASCADE`,
  );

  const landlordId = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000030', 'landlord', 'active') RETURNING id`,
  );
  await pool.query(
    `INSERT INTO landlords (user_id, legal_name, kyc_status) VALUES ($1, 'LL Availability Test', 'verified')`,
    [landlordId],
  );
  const opsLeadId = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000031', 'ops_lead', 'active') RETURNING id`,
  );
  const inspectorId = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000032', 'ops_inspector', 'active') RETURNING id`,
  );
  await pool.query(
    `INSERT INTO ops_staff (user_id, team) VALUES ($1, 'lead'), ($2, 'inspector')`,
    [opsLeadId, inspectorId],
  );
  const studentUserId = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000033', 'student', 'active') RETURNING id`,
  );
  await pool.query(`INSERT INTO students (user_id, university) VALUES ($1, 'MUK')`, [studentUserId]);
  studentId = studentUserId;

  const propertyId = await seed(
    `INSERT INTO properties (landlord_id, name, street_address, status, gps_lat, gps_lon, catchment)
     VALUES ($1, 'Availability Test Hostel', 'Wandegeya', 'active', 0.33, 32.57, 'MUK') RETURNING id`,
    [landlordId],
  );
  const semesterId = await seed(
    `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
     VALUES ('Sem Availability Test', '2026-08-01', '2026-12-15', '2026-11-15') RETURNING id`,
  );
  await pool.query(
    `INSERT INTO verification_visits
       (property_id, inspector_id, checklist, client_idempotency_key, result, approved_by, approved_at, completed_at)
     VALUES ($1, $2, $3, 'availability-test-visit', 'passed', $4, now(), now())`,
    [propertyId, inspectorId, JSON.stringify(FULL_CHECKLIST), opsLeadId],
  );
  listingId = await seed(
    `INSERT INTO listings (property_id, semester_id, status) VALUES ($1, $2, 'pending_verification') RETURNING id`,
    [propertyId, semesterId],
  );

  const published = await ops.publishListing({ userId: opsLeadId, role: 'ops_lead' }, {
    listingId,
    amenities: { water: true },
    description: 'Availability test listing',
    units: [
      { label: 'Unit Fulfilled', capacity: 1, roomCategory: 'single', pricePerTermUgx: 500_000 },
      { label: 'Unit Pending', capacity: 1, roomCategory: 'single', pricePerTermUgx: 500_000 },
      { label: 'Unit Cancelled', capacity: 1, roomCategory: 'single', pricePerTermUgx: 500_000 },
    ],
  });
  versionId = published.listing.currentVersionId!;

  const unitRows = await pool.query(
    `SELECT id, label FROM units WHERE listing_id = $1 ORDER BY label`,
    [listingId],
  );
  const byLabel = new Map(unitRows.rows.map((r: { id: string; label: string }) => [r.label, r.id]));
  unitFulfilled = byLabel.get('Unit Fulfilled')!;
  unitPending = byLabel.get('Unit Pending')!;
  unitCancelled = byLabel.get('Unit Cancelled')!;

  // A 'fulfilled' reservation — the exact case the old `status = 'held'`
  // check missed. A 'payment_pending' one, same gap. A 'cancelled' one on
  // the third unit, to prove the fix doesn't over-hide rooms that freed up.
  await pool.query(
    `INSERT INTO reservations (student_id, unit_id, listing_version_id, status, idempotency_key)
     VALUES ($1, $2, $3, 'fulfilled', 'avail-test-fulfilled-01')`,
    [studentId, unitFulfilled, versionId],
  );
  await pool.query(
    `INSERT INTO reservations (student_id, unit_id, listing_version_id, status, idempotency_key)
     VALUES ($1, $2, $3, 'payment_pending', 'avail-test-pending-01')`,
    [studentId, unitPending, versionId],
  );
  await pool.query(
    `INSERT INTO reservations (student_id, unit_id, listing_version_id, status, idempotency_key)
     VALUES ($1, $2, $3, 'cancelled', 'avail-test-cancelled-01')`,
    [studentId, unitCancelled, versionId],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('detail() public availability', () => {
  it('marks a fulfilled unit as unavailable, not just a held one', async () => {
    const detail = await listings.detail(listingId);
    const availability = new Map(detail.availability.map((a) => [a.id, a.available]));
    expect(availability.get(unitFulfilled)).toBe(false);
    expect(availability.get(unitPending)).toBe(false);
    expect(availability.get(unitCancelled)).toBe(true);
  });
});

describe('search() availability', () => {
  it('only counts still-available units, and keeps a partially-booked listing visible', async () => {
    const rows = (await listings.search({
      minLon: 32.5,
      minLat: 0.25,
      maxLon: 32.65,
      maxLat: 0.42,
      limit: 50,
    } as never)) as { id: string; unit_count: number }[];
    const row = rows.find((r) => r.id === listingId);
    expect(row).toBeDefined();
    // 3 units total, 2 occupied (fulfilled + payment_pending), 1 free (cancelled doesn't count).
    // search() returns raw snake_case SQL rows — COUNT(*) arrives as a string;
    // the shared listingSearchResultSchema coerces it at the wire boundary.
    expect(Number(row!.unit_count)).toBe(1);
  });

  it('excludes a listing entirely once every unit is occupied', async () => {
    await pool.query(`UPDATE reservations SET status = 'fulfilled' WHERE unit_id = $1`, [unitCancelled]);
    const rows = (await listings.search({
      minLon: 32.5,
      minLat: 0.25,
      maxLon: 32.65,
      maxLat: 0.42,
      limit: 50,
    } as never)) as { id: string }[];
    expect(rows.find((r) => r.id === listingId)).toBeUndefined();
  });
});
