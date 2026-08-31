/**
 * A landlord's KYC review was previously never enforced anywhere in the
 * property → visit → approve → publish pipeline: an unreviewed (or even
 * explicitly rejected) landlord could submit a property and Ops could carry
 * it all the way to a publicly-visible verified listing with no KYC gate
 * anywhere. These tests cover the two points that now block it —
 * ListingsService.submitProperty() (earliest, cheapest gate) and
 * OpsService.publishListing() (defense in depth: re-checked at the moment
 * the listing actually goes public, since a landlord verified at
 * submission time could be rejected or suspended any time before publish).
 */
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import type { LogtoManagementClient } from '../../src/modules/auth/logto-management.client';
import { AuditService } from '../../src/modules/ops/audit.service';
import { OpsService } from '../../src/modules/ops/ops.service';
import type { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { ListingsService } from '../../src/modules/listings/listings.service';
import type { RlsContext } from '../../src/db/rls-context';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const audit = new AuditService(rlsDb);
// Only inviteLandlord() touches auth.api — unused by anything these tests exercise.
const ops = new OpsService(rlsDb, audit, {} as NotificationsService, {} as LogtoManagementClient);
const listings = new ListingsService(rlsDb);

const submitInput = (name: string) => ({
  name,
  streetAddress: 'Kikoni',
  type: 'hostel' as const,
  catchment: 'MUK' as const,
  proposedRoomCategories: [],
  proposedAmenities: {},
  coverPhotoKey: undefined,
  otherCatchments: [],
  furnishingItems: {},
  securityFeatures: {},
  accessibilityFeatures: {},
  photographyConsent: false,
  transportShuttle: false,
  advanceRentRequired: false,
  authorityRole: 'owner' as const,
  declaredInfoAccurate: true as const,
  declaredAuthorityOverProperty: true as const,
  declaredWillKeepUpdated: true as const,
  declaredAuthorizesPublish: true as const,
  declaredConsentToProcessing: true as const,
});

let opsLead: string;
let inspector: string;
let landlordNoProfile: string;
let landlordPending: string;
let landlordRejected: string;
let landlordVerified: string;
let landlordSuspended: string;
let semesterId: string;

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  const res = await pool.query(sql, params);
  return res.rows[0]?.id as string;
}

beforeAll(async () => {
  await pool.query(
    `TRUNCATE users, landlords, ops_staff, semesters, properties,
     verification_visits, listings CASCADE`,
  );

  opsLead = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000200', 'ops_lead', 'active') RETURNING id`,
  );
  inspector = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000201', 'ops_inspector', 'active') RETURNING id`,
  );
  await pool.query(`INSERT INTO ops_staff (user_id, team) VALUES ($1, 'lead'), ($2, 'inspector')`, [
    opsLead,
    inspector,
  ]);
  semesterId = await seed(
    `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
     VALUES ('Sem KYC Gate Test', '2026-08-01', '2026-12-15', '2026-11-15') RETURNING id`,
  );

  landlordNoProfile = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000202', 'landlord', 'active') RETURNING id`,
  );

  landlordPending = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000203', 'landlord', 'active') RETURNING id`,
  );
  await pool.query(
    `INSERT INTO landlords (user_id, legal_name, kyc_status) VALUES ($1, 'LL Pending', 'pending')`,
    [landlordPending],
  );

  landlordRejected = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000204', 'landlord', 'active') RETURNING id`,
  );
  await pool.query(
    `INSERT INTO landlords (user_id, legal_name, kyc_status) VALUES ($1, 'LL Rejected', 'rejected')`,
    [landlordRejected],
  );

  landlordVerified = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000205', 'landlord', 'active') RETURNING id`,
  );
  await pool.query(
    `INSERT INTO landlords (user_id, legal_name, kyc_status) VALUES ($1, 'LL Verified', 'verified')`,
    [landlordVerified],
  );

  landlordSuspended = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000206', 'landlord', 'suspended') RETURNING id`,
  );
  await pool.query(
    `INSERT INTO landlords (user_id, legal_name, kyc_status) VALUES ($1, 'LL Suspended', 'verified')`,
    [landlordSuspended],
  );
});

afterAll(async () => {
  await pool.end();
});

const ctxFor = (userId: string): RlsContext => ({ userId, role: 'landlord' });

describe('submitProperty KYC gate', () => {
  it('rejects a landlord with no landlords profile row at all', async () => {
    await expect(
      listings.submitProperty(ctxFor(landlordNoProfile), submitInput('No Profile Hostel')),
    ).rejects.toThrow('Complete your landlord profile');
  });

  it('rejects a landlord whose KYC is still pending review', async () => {
    await expect(
      listings.submitProperty(ctxFor(landlordPending), submitInput('Pending Hostel')),
    ).rejects.toThrow('pending review');
  });

  it('rejects a landlord whose KYC was explicitly rejected', async () => {
    await expect(
      listings.submitProperty(ctxFor(landlordRejected), submitInput('Rejected Hostel')),
    ).rejects.toThrow('not approved');
  });

  it('allows a KYC-verified landlord to submit a property', async () => {
    const property = await listings.submitProperty(ctxFor(landlordVerified), submitInput('Verified Hostel'));
    expect(property!.status).toBe('active');
  });
});

describe('publishListing KYC/account-status defense in depth', () => {
  const leadCtx = (): RlsContext => ({ userId: opsLead, role: 'ops_lead' });
  const fullChecklist = JSON.stringify(
    Object.fromEntries(
      ['location_gps', 'rooms_capacity', 'amenities', 'photos', 'landlord_identity', 'safety'].map((c) => [
        c,
        { passed: true },
      ]),
    ),
  );

  async function propertyWithApprovedVisit(landlordId: string, name: string) {
    const propertyId = await seed(
      `INSERT INTO properties (landlord_id, name, street_address, status, catchment)
       VALUES ($1, $2, 'Kikoni', 'active', 'MUK') RETURNING id`,
      [landlordId, name],
    );
    await seed(
      `INSERT INTO verification_visits
         (property_id, inspector_id, checklist, client_idempotency_key, result, approved_by, approved_at)
       VALUES ($1, $2, $3, $4, 'passed', $5, now()) RETURNING id`,
      [propertyId, inspector, fullChecklist, `kyc-gate-visit-${name}`, opsLead],
    );
    const listingId = await seed(
      `INSERT INTO listings (property_id, semester_id, status) VALUES ($1, $2, 'pending_verification') RETURNING id`,
      [propertyId, semesterId],
    );
    return listingId;
  }

  it('blocks publish when the landlord is not KYC-verified', async () => {
    const listingId = await propertyWithApprovedVisit(landlordPending, 'Pending Publish Hostel');
    await expect(
      ops.publishListing(leadCtx(), {
        listingId,
        units: [{ label: 'A1', capacity: 1, roomCategory: 'single', pricePerTermUgx: 500000 }],
        amenities: {},
        description: 'desc',
      }),
    ).rejects.toThrow('not KYC-verified');
  });

  it('blocks publish when the landlord account is suspended, even if KYC was verified', async () => {
    const listingId = await propertyWithApprovedVisit(landlordSuspended, 'Suspended Publish Hostel');
    await expect(
      ops.publishListing(leadCtx(), {
        listingId,
        units: [{ label: 'A1', capacity: 1, roomCategory: 'single', pricePerTermUgx: 500000 }],
        amenities: {},
        description: 'desc',
      }),
    ).rejects.toThrow('not active');
  });

  it('publishes normally for a KYC-verified, active landlord', async () => {
    const listingId = await propertyWithApprovedVisit(landlordVerified, 'Clean Publish Hostel');
    const result = await ops.publishListing(leadCtx(), {
      listingId,
      units: [{ label: 'A1', capacity: 1, roomCategory: 'single', pricePerTermUgx: 500000 }],
      amenities: {},
      description: 'desc',
    });
    expect(result.listing.status).toBe('verified');
  });
});

describe('decideKyc property-status release', () => {
  it('flips the landlord\'s pending_kyc properties to active on a verified decision, not on rejection', async () => {
    const landlordId = await seed(
      `INSERT INTO users (phone, role, status) VALUES ('+256710000207', 'landlord', 'active') RETURNING id`,
    );
    await pool.query(
      `INSERT INTO landlords (user_id, legal_name, kyc_status) VALUES ($1, 'LL Decision Test', 'pending')`,
      [landlordId],
    );
    const propertyId = await seed(
      `INSERT INTO properties (landlord_id, name, street_address, status, catchment)
       VALUES ($1, 'Decision Test Hostel', 'Kikoni', 'pending_kyc', 'MUK') RETURNING id`,
      [landlordId],
    );

    await ops.decideKyc({ userId: opsLead, role: 'ops_lead' }, landlordId, { decision: 'verified' });

    const [row] = (
      await pool.query<{ status: string }>(`SELECT status FROM properties WHERE id = $1`, [propertyId])
    ).rows;
    expect(row!.status).toBe('active');
  });
});
