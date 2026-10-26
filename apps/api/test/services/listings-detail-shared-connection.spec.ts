/**
 * detail() runs its reads as named prepared statements, which live on the
 * pooled connection and are reused by the next call. With a one-connection
 * pool, a second listing's detail must come back with its own property and
 * rooms, not the first listing's (a statement reused with stale parameters or
 * text would show up here).
 */
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import type { LogtoManagementClient } from '../../src/modules/auth/logto-management.client';
import { ListingsService } from '../../src/modules/listings/listings.service';
import type { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { AuditService } from '../../src/modules/ops/audit.service';
import { OpsService } from '../../src/modules/ops/ops.service';
import { testDatabaseUrl } from '../test-database-url';

const pool = new Pool({ connectionString: testDatabaseUrl(), max: 1 });
const rlsDb = new RlsDb(pool);
const ops = new OpsService(rlsDb, new AuditService(rlsDb), {} as NotificationsService, {} as LogtoManagementClient);
const listings = new ListingsService(rlsDb);

const FULL_CHECKLIST = Object.fromEntries(
  ['location_gps', 'rooms_capacity', 'amenities', 'photos', 'landlord_identity', 'safety'].map(
    (c) => [c, { passed: true }],
  ),
);

let listingA: string;
let listingB: string;

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  return (await pool.query(sql, params)).rows[0]?.id as string;
}

async function publishedListing(
  names: { property: string; room: string; visitKey: string },
  ids: { landlordId: string; inspectorId: string; opsLeadId: string; semesterId: string },
): Promise<string> {
  const propertyId = await seed(
    `INSERT INTO properties (landlord_id, name, street_address, status, gps_lat, gps_lon, catchment)
     VALUES ($1, $2, 'Wandegeya', 'active', 0.33, 32.57, 'MUK') RETURNING id`,
    [ids.landlordId, names.property],
  );
  await pool.query(
    `INSERT INTO verification_visits
       (property_id, inspector_id, checklist, client_idempotency_key, result, approved_by, approved_at, completed_at)
     VALUES ($1, $2, $3, $4, 'passed', $5, now(), now())`,
    [propertyId, ids.inspectorId, JSON.stringify(FULL_CHECKLIST), names.visitKey, ids.opsLeadId],
  );
  const listingId = await seed(
    `INSERT INTO listings (property_id, semester_id, status) VALUES ($1, $2, 'pending_verification') RETURNING id`,
    [propertyId, ids.semesterId],
  );
  await ops.publishListing({ userId: ids.opsLeadId, role: 'ops_lead', mfaVerified: true }, {
    listingId,
    amenities: { water: true },
    description: `${names.property} listing`,
    units: [{ label: names.room, capacity: 1, roomCategory: 'single', pricePerTermUgx: 500_000 }],
  });
  return listingId;
}

beforeAll(async () => {
  await pool.query(
    `TRUNCATE users, students, landlords, ops_staff, semesters, properties,
     verification_visits, listings, listing_versions, units, beds, reservations CASCADE`,
  );
  const landlordId = await seed(`INSERT INTO users (phone, role, status) VALUES ('+256710000071', 'landlord', 'active') RETURNING id`);
  await pool.query(`INSERT INTO landlords (user_id, legal_name, kyc_status) VALUES ($1, 'LL Shared Conn', 'verified')`, [landlordId]);
  const opsLeadId = await seed(`INSERT INTO users (phone, role, status) VALUES ('+256710000072', 'ops_lead', 'active') RETURNING id`);
  const inspectorId = await seed(`INSERT INTO users (phone, role, status) VALUES ('+256710000073', 'ops_inspector', 'active') RETURNING id`);
  await pool.query(`INSERT INTO ops_staff (user_id, team) VALUES ($1, 'lead'), ($2, 'inspector')`, [opsLeadId, inspectorId]);
  await pool.query(
    `INSERT INTO user_role_assignments (user_id, role_id, scope_type, scope_id, assigned_by, reason)
     SELECT u.id, r.id, 'platform_wide', NULL, u.id, 'test fixture'
     FROM users u JOIN roles r ON r.key = u.role::text WHERE u.id IN ($1, $2)`,
    [opsLeadId, inspectorId],
  );
  const semesterId = await seed(
    `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
     VALUES ('Sem Shared Conn', '2026-08-01', '2026-12-15', '2026-11-15') RETURNING id`,
  );
  const ids = { landlordId, inspectorId, opsLeadId, semesterId };
  listingA = await publishedListing({ property: 'Hostel A', room: 'A1', visitKey: 'shared-conn-a' }, ids);
  listingB = await publishedListing({ property: 'Hostel B', room: 'B1', visitKey: 'shared-conn-b' }, ids);
});

afterAll(async () => {
  await pool.end();
});

it("returns the second listing's own property and rooms after the first on the same connection", async () => {
  await listings.detail(listingA);

  const detail = await listings.detail(listingB);

  expect([detail.property.name, detail.units.map((u) => u.label)]).toEqual(['Hostel B', ['B1']]);
});
