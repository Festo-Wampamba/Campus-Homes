/**
 * The landlord dashboard banner tells "verified, awaiting inspection" apart
 * from "listings live" using hasLiveListing on GET /listings/properties/mine.
 */
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import { ListingsService } from '../../src/modules/listings/listings.service';
import type { RlsContext } from '../../src/db/rls-context';
import { testDatabaseUrl } from '../test-database-url';

const pool = new Pool({ connectionString: testDatabaseUrl(), max: 5 });
const listings = new ListingsService(new RlsDb(pool));

let landlordA: string;
let liveProperty: string;
let draftProperty: string;
let otherLandlordProperty: string;

const ctxA = (): RlsContext => ({ userId: landlordA, role: 'landlord' });

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  const res = await pool.query(sql, params);
  return res.rows[0]?.id as string;
}

async function verifiedListing(propertyId: string, semesterId: string, key: string, inspector: string, lead: string) {
  const checklist = JSON.stringify(
    Object.fromEntries(
      ['location_gps', 'rooms_capacity', 'amenities', 'photos', 'landlord_identity', 'safety'].map((c) => [
        c,
        { passed: true },
      ]),
    ),
  );
  // The verified-listing trigger requires a lead-approved, fully-passed visit.
  await pool.query(
    `INSERT INTO verification_visits
       (property_id, inspector_id, checklist, client_idempotency_key, result, approved_by, approved_at)
     VALUES ($1, $2, $3, $4, 'passed', $5, now())`,
    [propertyId, inspector, checklist, key, lead],
  );
  await pool.query(`INSERT INTO listings (property_id, semester_id, status) VALUES ($1, $2, 'verified')`, [
    propertyId,
    semesterId,
  ]);
}

beforeAll(async () => {
  await pool.query(
    `TRUNCATE users, landlords, ops_staff, semesters, properties, verification_visits, listings, listing_versions, units CASCADE`,
  );
  landlordA = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000040', 'landlord', 'active') RETURNING id`,
  );
  const landlordB = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000041', 'landlord', 'active') RETURNING id`,
  );
  await pool.query(`INSERT INTO landlords (user_id, legal_name) VALUES ($1, 'LL Mine A'), ($2, 'LL Mine B')`, [
    landlordA,
    landlordB,
  ]);
  const lead = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000042', 'ops_lead', 'active') RETURNING id`,
  );
  const inspector = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000043', 'ops_inspector', 'active') RETURNING id`,
  );
  await pool.query(`INSERT INTO ops_staff (user_id, team, active) VALUES ($1, 'lead', true), ($2, 'inspector', true)`, [
    lead,
    inspector,
  ]);
  const semester = await seed(
    `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
     VALUES ('Sem Mine Test', '2026-08-01', '2026-12-15', '2026-11-15') RETURNING id`,
  );
  const property = (landlord: string, name: string) =>
    seed(
      `INSERT INTO properties (landlord_id, name, street_address, status, catchment)
       VALUES ($1, $2, 'Kikoni', 'active', 'MUK') RETURNING id`,
      [landlord, name],
    );
  liveProperty = await property(landlordA, 'Mine Live');
  draftProperty = await property(landlordA, 'Mine Draft');
  otherLandlordProperty = await property(landlordB, 'Other Live');
  await verifiedListing(liveProperty, semester, 'mine-live-visit', inspector, lead);
  await pool.query(`INSERT INTO listings (property_id, semester_id, status) VALUES ($1, $2, 'draft')`, [
    draftProperty,
    semester,
  ]);
  await verifiedListing(otherLandlordProperty, semester, 'mine-other-visit', inspector, lead);
});

afterAll(() => pool.end());

describe('ListingsService.myProperties hasLiveListing', () => {
  it('marks a property with a verified listing as live', async () => {
    const rows = await listings.myProperties(ctxA());
    expect(rows.find((p) => p.id === liveProperty)?.hasLiveListing).toBe(true);
  });

  it('marks a property with only a draft listing as not live', async () => {
    const rows = await listings.myProperties(ctxA());
    expect(rows.find((p) => p.id === draftProperty)?.hasLiveListing).toBe(false);
  });

  it("never returns another landlord's property", async () => {
    const rows = await listings.myProperties(ctxA());
    expect(rows.map((p) => p.id)).not.toContain(otherLandlordProperty);
  });
});
