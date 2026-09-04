/**
 * Regression coverage for the "rooms not appearing" bug (landlord property
 * dialog): propertyDetail() used to pick the property's most-recently-created
 * listing regardless of status. A re-verification cycle creates a fresh
 * `draft` listing (zero units — units only exist from publishListing()
 * onward) for a new semester, which — being newer — shadowed the still-live
 * `verified` listing's real rooms, so the dialog showed "No rooms yet" even
 * though the property had published, reservable rooms.
 */
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import { ListingsService } from '../../src/modules/listings/listings.service';
import type { RlsContext } from '../../src/db/rls-context';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const listings = new ListingsService(rlsDb);

let landlordId: string;
let propertyId: string;
let verifiedListingId: string;
let draftListingId: string;

const landlordCtx = (): RlsContext => ({ userId: landlordId, role: 'landlord' });

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  const res = await pool.query(sql, params);
  return res.rows[0]?.id as string;
}

beforeAll(async () => {
  await pool.query(
    `TRUNCATE users, landlords, ops_staff, semesters, properties,
     verification_visits, listings, listing_versions, units CASCADE`,
  );

  landlordId = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000020', 'landlord', 'active') RETURNING id`,
  );
  await pool.query(`INSERT INTO landlords (user_id, legal_name) VALUES ($1, 'LL Property Detail Test')`, [
    landlordId,
  ]);
  propertyId = await seed(
    `INSERT INTO properties (landlord_id, name, street_address, status, catchment)
     VALUES ($1, 'Property Detail Test Hostel', 'Kikoni', 'active', 'MUK') RETURNING id`,
    [landlordId],
  );

  const semester = await seed(
    `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
     VALUES ('Sem Property Detail Test', '2026-08-01', '2026-12-15', '2026-11-15') RETURNING id`,
  );

  // The verified-listing DB trigger requires a lead-approved, fully-passed
  // visit to exist first (same precedent as ops-directory.spec.ts).
  const opsLead = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000021', 'ops_lead', 'active') RETURNING id`,
  );
  const inspector = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000022', 'ops_inspector', 'active') RETURNING id`,
  );
  await pool.query(
    `INSERT INTO ops_staff (user_id, team, active) VALUES ($1, 'lead', true), ($2, 'inspector', true)`,
    [opsLead, inspector],
  );
  const fullChecklist = JSON.stringify(
    Object.fromEntries(
      ['location_gps', 'rooms_capacity', 'amenities', 'photos', 'landlord_identity', 'safety'].map(
        (c) => [c, { passed: true }],
      ),
    ),
  );
  await pool.query(
    `INSERT INTO verification_visits
       (property_id, inspector_id, checklist, client_idempotency_key, result, approved_by, approved_at)
     VALUES ($1, $2, $3, 'property-detail-test-visit', 'passed', $4, now())`,
    [propertyId, inspector, fullChecklist, opsLead],
  );

  // The live, verified listing — created first, has a real room.
  verifiedListingId = await seed(
    `INSERT INTO listings (property_id, semester_id, status) VALUES ($1, $2, 'verified') RETURNING id`,
    [propertyId, semester],
  );
  const unitId = await seed(
    `INSERT INTO units (property_id, label, capacity, room_category) VALUES ($1, 'Single 1', 1, 'single') RETURNING id`,
    [propertyId],
  );
  await pool.query(
    `INSERT INTO unit_semester_pricing (unit_id, semester_id, price_per_term_ugx) VALUES ($1, $2, 800000)`,
    [unitId, semester],
  );

  // A newer re-verification draft for a fresh semester — created after the
  // verified listing, with zero units (units only exist from publish
  // onward). This is the row the old "most recent by createdAt" query would
  // have picked.
  const newSemester = await seed(
    `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
     VALUES ('Sem Property Detail Test — Next', '2027-01-10', '2027-05-15', '2026-12-10') RETURNING id`,
  );
  draftListingId = await seed(
    `INSERT INTO listings (property_id, semester_id, status) VALUES ($1, $2, 'draft') RETURNING id`,
    [propertyId, newSemester],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('propertyDetail', () => {
  it('prefers the live verified listing (with rooms) over a newer, emptier re-verification draft', async () => {
    const detail = await listings.propertyDetail(landlordCtx(), propertyId);

    expect(detail.listing?.id).toBe(verifiedListingId);
    expect(detail.listing?.id).not.toBe(draftListingId);
    expect(detail.rooms).toHaveLength(1);
    expect(detail.rooms[0]?.label).toBe('Single 1');
  });
});
