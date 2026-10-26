/**
 * Management-only properties (0076, Festo 2026-10-26): a landlord can run a
 * property on CampusHomes without listing it to students. Such a property
 * never enters the Ops verification queue, can never get a live listing
 * (service check + DB trigger), and its room changes are reviewed without a
 * site visit. Taking a live listing down is staff-only.
 */
import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Pool } from 'pg';

import { ConsoleMessaging } from '../../src/adapters/messaging.adapter';
import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import type { LogtoManagementClient } from '../../src/modules/auth/logto-management.client';
import { ListingsService } from '../../src/modules/listings/listings.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { AuditService } from '../../src/modules/ops/audit.service';
import { OpsService } from '../../src/modules/ops/ops.service';
import { RoomManagementService } from '../../src/modules/room-management/room-management.service';
import { AdminPropertiesService } from '../../src/modules/staff/admin-properties.service';
import { testDatabaseUrl } from '../test-database-url';

const TEST_DATABASE_URL = testDatabaseUrl();
// Services call loadEnv(), which requires DATABASE_URL.
process.env.DATABASE_URL = process.env.DATABASE_URL || TEST_DATABASE_URL;

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const audit = new AuditService(rlsDb);
const notifications = new NotificationsService(rlsDb, new ConsoleMessaging());
const ops = new OpsService(rlsDb, audit, notifications, {} as LogtoManagementClient);
const listings = new ListingsService(rlsDb, notifications, undefined, audit);
const adminProperties = new AdminPropertiesService(rlsDb, audit);
const rooms = new RoomManagementService(rlsDb, audit, notifications);

const FULL_CHECKLIST = Object.fromEntries(
  ['location_gps', 'rooms_capacity', 'amenities', 'photos', 'landlord_identity', 'safety'].map(
    (c) => [c, { passed: true }],
  ),
);

const submitInput = (name: string) => ({
  name,
  streetAddress: 'Kikoni',
  type: 'hostel' as const,
  catchment: 'MUK' as const,
  proposedRoomCategories: [],
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
  declaredAuthorizesPublish: false,
  declaredConsentToProcessing: true as const,
  listingIntent: 'manage_only' as const,
});

let landlordCtx: RlsContext;
let opsLeadCtx: RlsContext;
let inspectorId: string;
let semesterId: string;

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  return (await pool.query(sql, params)).rows[0]?.id as string;
}

/** A property with a passed, lead-approved visit and a listing ready to publish. */
async function inspectedProperty(name: string, intent: 'list' | 'manage_only') {
  const propertyId = await seed(
    `INSERT INTO properties (landlord_id, name, street_address, status, gps_lat, gps_lon, catchment, listing_intent)
     VALUES ($1, $2, 'Kikoni', 'active', 0.33, 32.57, 'MUK', $3) RETURNING id`,
    [landlordCtx.userId, name, intent],
  );
  await pool.query(
    `INSERT INTO verification_visits
       (property_id, inspector_id, checklist, client_idempotency_key, result, approved_by, approved_at, completed_at)
     VALUES ($1, $2, $3, $4, 'passed', $5, now(), now())`,
    [propertyId, inspectorId, JSON.stringify(FULL_CHECKLIST), `visit-${name}`, opsLeadCtx.userId],
  );
  const listingId = await seed(
    `INSERT INTO listings (property_id, semester_id, status) VALUES ($1, $2, 'pending_verification') RETURNING id`,
    [propertyId, semesterId],
  );
  return { propertyId, listingId };
}

const publish = (listingId: string) => ops.publishListing(opsLeadCtx, {
  listingId,
  amenities: { water: true },
  description: 'Test listing',
  units: [{ label: `R-${listingId.slice(0, 6)}`, capacity: 1, roomCategory: 'single', pricePerTermUgx: 500_000 }],
});

const SUSPEND = new Set(['properties.update', 'listings.suspend']);
const freshSignIn = () => new Date().toISOString();
const staleSignIn = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();

const queueIds = async () => ((await ops.queue(opsLeadCtx)) as { id: string }[]).map((row) => row.id);

beforeAll(async () => {
  await pool.query(
    `TRUNCATE users, landlords, ops_staff, semesters, properties, verification_visits, listings,
     listing_versions, units, beds, reservations, room_types, room_inventory_change_sets CASCADE`,
  );
  const landlordId = await seed(`INSERT INTO users (phone, role, status) VALUES ('+256710000761', 'landlord', 'active') RETURNING id`);
  await pool.query(`INSERT INTO landlords (user_id, legal_name, kyc_status) VALUES ($1, 'LL Manage Only', 'verified')`, [landlordId]);
  const opsLeadId = await seed(`INSERT INTO users (phone, role, status) VALUES ('+256710000762', 'ops_lead', 'active') RETURNING id`);
  inspectorId = await seed(`INSERT INTO users (phone, role, status) VALUES ('+256710000763', 'ops_inspector', 'active') RETURNING id`);
  await pool.query(`INSERT INTO ops_staff (user_id, team) VALUES ($1, 'lead'), ($2, 'inspector')`, [opsLeadId, inspectorId]);
  await pool.query(
    `INSERT INTO user_role_assignments (user_id, role_id, scope_type, scope_id, assigned_by, reason)
     SELECT u.id, r.id, 'platform_wide', NULL, u.id, 'test fixture'
     FROM users u JOIN roles r ON r.key = u.role::text WHERE u.id IN ($1, $2)`,
    [opsLeadId, inspectorId],
  );
  semesterId = await seed(
    `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
     VALUES ('Sem Manage Only', '2026-08-01', '2026-12-15', '2026-11-15') RETURNING id`,
  );
  landlordCtx = { userId: landlordId, role: 'landlord' };
  opsLeadCtx = { userId: opsLeadId, role: 'ops_lead', mfaVerified: true };
});

afterAll(async () => {
  await pool.end();
});

describe('submitting a manage-only property', () => {
  it('records no consent to publish', async () => {
    const property = await listings.submitProperty(landlordCtx, { ...submitInput('Private Hostel'), declaredAuthorizesPublish: true });

    expect([property.listingIntent, property.declaredAuthorizesPublish]).toEqual(['manage_only', false]);
  });

  it('keeps it out of the Ops verification queue', async () => {
    const property = await listings.submitProperty(landlordCtx, submitInput('Quiet Hostel'));

    expect(await queueIds()).not.toContain(property.id);
  });
});

describe("landlord's switch", () => {
  it('puts the property in the Ops queue when they choose to list it', async () => {
    const property = await listings.submitProperty(landlordCtx, submitInput('Later Listed Hostel'));

    await listings.setListingIntent(landlordCtx, property.id, 'list');

    expect(await queueIds()).toContain(property.id);
  });

  it('refuses to make a property with a live listing manage-only', async () => {
    const { propertyId, listingId } = await inspectedProperty('Live Hostel', 'list');
    await publish(listingId);

    await expect(listings.setListingIntent(landlordCtx, propertyId, 'manage_only')).rejects.toThrow(ConflictException);
  });
});

describe('publishing', () => {
  it('refuses a manage-only property', async () => {
    const { listingId } = await inspectedProperty('Never Listed Hostel', 'manage_only');

    await expect(publish(listingId)).rejects.toThrow(ConflictException);
  });

  it('is refused by the database even outside the service', async () => {
    const { listingId } = await inspectedProperty('Direct SQL Hostel', 'manage_only');

    const code = await pool.query(`UPDATE listings SET status = 'verified', verified_at = now() WHERE id = $1`, [listingId])
      .then(() => null, (err: { code?: string }) => err.code);

    expect(code).toBe('23514');
  });

  it('is refused by the database when a live property is switched without taking it down', async () => {
    const { propertyId, listingId } = await inspectedProperty('Direct Switch Hostel', 'list');
    await publish(listingId);

    const code = await pool.query(`UPDATE properties SET listing_intent = 'manage_only' WHERE id = $1`, [propertyId])
      .then(() => null, (err: { code?: string }) => err.code);

    expect(code).toBe('23514');
  });
});

describe('staff switch', () => {
  it('takes the live listing down when making a property manage-only', async () => {
    const { propertyId, listingId } = await inspectedProperty('Taken Down Hostel', 'list');
    await publish(listingId);

    await adminProperties.setListingIntent(opsLeadCtx, SUSPEND, freshSignIn(), propertyId, 'manage_only');

    expect((await pool.query(`SELECT status::text FROM listings WHERE id = $1`, [listingId])).rows[0].status).toBe('suspended');
  });

  it('needs listings.suspend to take a live listing down', async () => {
    const { propertyId, listingId } = await inspectedProperty('No Suspend Hostel', 'list');
    await publish(listingId);

    await expect(
      adminProperties.setListingIntent(opsLeadCtx, new Set(['properties.update']), freshSignIn(), propertyId, 'manage_only'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('needs a fresh sign-in to take a live listing down', async () => {
    const { propertyId, listingId } = await inspectedProperty('Stale Session Hostel', 'list');
    await publish(listingId);

    await expect(
      adminProperties.setListingIntent(opsLeadCtx, SUSPEND, staleSignIn, propertyId, 'manage_only'),
    ).rejects.toThrow(UnauthorizedException);
  });
});

describe('switching back to listing', () => {
  it('puts a previously inspected property back in the Ops queue', async () => {
    const { propertyId } = await inspectedProperty('Returning Hostel', 'manage_only');

    await listings.setListingIntent(landlordCtx, propertyId, 'list');

    expect(await queueIds()).toContain(propertyId);
  });

  it('refuses to publish on the inspection from before the switch', async () => {
    const { propertyId, listingId } = await inspectedProperty('Old Inspection Hostel', 'manage_only');
    await listings.setListingIntent(landlordCtx, propertyId, 'list');

    await expect(publish(listingId)).rejects.toThrow(ConflictException);
  });

  it('ignores a landlord clearing the switch time directly', async () => {
    const { propertyId } = await inspectedProperty('Cleared Stamp Hostel', 'manage_only');
    await listings.setListingIntent(landlordCtx, propertyId, 'list');

    await pool.query(`UPDATE properties SET listing_requested_at = NULL WHERE id = $1`, [propertyId]);

    expect((await pool.query(`SELECT listing_requested_at FROM properties WHERE id = $1`, [propertyId])).rows[0].listing_requested_at).not.toBeNull();
  });
});

describe('a publish racing a switch to manage-only', () => {
  it('fails once the switch commits first', async () => {
    const { propertyId, listingId } = await inspectedProperty('Race Hostel', 'list');
    const switcher = await pool.connect();
    const publisher = await pool.connect();
    try {
      await switcher.query('BEGIN');
      await switcher.query(`UPDATE properties SET listing_intent = 'manage_only' WHERE id = $1`, [propertyId]);
      // Blocks on the property row lock until the switch commits.
      const publishing = publisher.query(`UPDATE listings SET status = 'verified', verified_at = now() WHERE id = $1`, [listingId])
        .then(() => null, (err: { code?: string }) => err.code);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await switcher.query('COMMIT');

      expect(await publishing).toBe('23514');
    } finally {
      switcher.release();
      publisher.release();
    }
  });
});

describe('room changes on a manage-only property', () => {
  it('go to Ops review without a site visit', async () => {
    const property = await listings.submitProperty(landlordCtx, submitInput('Rooms Only Hostel'));
    const roomType = await rooms.createRoomType(landlordCtx, property.id, {
      title: 'Single room', category: 'single', bathroomType: 'shared', capacity: 1, amenities: [],
      semesterId, pricePerTermUgx: 800000, photos: [],
    }) as { id: string };
    await rooms.bulkCreateRooms(landlordCtx, property.id, { roomTypeId: roomType.id, roomCodes: ['A1'], idempotencyKey: crypto.randomUUID() });
    const changeSetId = (await pool.query(
      `SELECT id FROM room_inventory_change_sets WHERE property_id = $1`, [property.id],
    )).rows[0].id as string;

    const submitted = await rooms.submitChangeSet(landlordCtx, changeSetId);

    expect(submitted.status).toBe('pending_review');
  });
});
