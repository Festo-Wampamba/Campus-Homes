/**
 * Road routes to campus (0072): computed once per hostel + campus and reused,
 * recomputed when the hostel's GPS moves, and never allowed to break the
 * listing page when the provider fails.
 */
import { Pool } from 'pg';

import { parseRoutesResponse, type DrivingRoute, type RoutingAdapter } from '../../src/adapters/routing.adapter';
import { RlsDb } from '../../src/db/db.module';
import { PropertyRoutes } from '../../src/modules/listings/property-routes';
import { testDatabaseUrl } from '../test-database-url';

const pool = new Pool({ connectionString: testDatabaseUrl(), max: 3 });
const CAMPUS = { lat: 0.3345, lon: 32.5687 };

class FakeRouting implements RoutingAdapter {
  calls = 0;
  constructor(private readonly result: DrivingRoute | Error) {}
  drivingRoute(): Promise<DrivingRoute | null> {
    this.calls += 1;
    return this.result instanceof Error ? Promise.reject(this.result) : Promise.resolve(this.result);
  }
}

let propertyId: string;

beforeAll(async () => {
  await pool.query(`TRUNCATE users CASCADE`);
  const landlordId = (await pool.query(
    `INSERT INTO users (phone, role, status, name) VALUES ('+256700009911', 'landlord', 'active', 'Route Landlord') RETURNING id`,
  )).rows[0].id;
  await pool.query(`INSERT INTO landlords (user_id, legal_name, kyc_status) VALUES ($1, 'Route Landlord', 'verified')`, [landlordId]);
  propertyId = (await pool.query(
    `INSERT INTO properties (landlord_id, name, street_address, status, gps_lat, gps_lon, catchment)
     VALUES ($1, 'Route Hostel', 'Kitintale', 'active', 0.3142, 32.6370, 'MUK') RETURNING id`,
    [landlordId],
  )).rows[0].id;
});

afterAll(async () => {
  await pool.query(`TRUNCATE users CASCADE`);
  await pool.end();
});

describe('parseRoutesResponse', () => {
  it('reads distance and duration from the first route', () => {
    expect(parseRoutesResponse({ routes: [{ distanceMeters: 10032, duration: '1500s' }] })).toEqual({ distanceMeters: 10032, durationSeconds: 1500 });
  });

  it('returns null when Google finds no road route', () => {
    expect(parseRoutesResponse({})).toBeNull();
  });

  it('returns null for a malformed duration', () => {
    expect(parseRoutesResponse({ routes: [{ distanceMeters: 10, duration: 'soon' }] })).toBeNull();
  });
});

describe('PropertyRoutes', () => {
  it('computes a route once and reuses it for the same coordinates', async () => {
    const routing = new FakeRouting({ distanceMeters: 10032, durationSeconds: 1500 });
    const routes = new PropertyRoutes(new RlsDb(pool), routing);

    await routes.forProperty(propertyId, 'MUK', { lat: 0.3142, lon: 32.637 }, CAMPUS);
    const second = await routes.forProperty(propertyId, 'MUK', { lat: 0.3142, lon: 32.637 }, CAMPUS);

    expect([routing.calls, second]).toEqual([1, { distanceMeters: 10032, durationSeconds: 1500 }]);
  });

  it('recomputes when the hostel moves', async () => {
    const routing = new FakeRouting({ distanceMeters: 9000, durationSeconds: 1200 });
    const routes = new PropertyRoutes(new RlsDb(pool), routing);

    const moved = await routes.forProperty(propertyId, 'MUK', { lat: 0.32, lon: 32.63 }, CAMPUS);

    expect([routing.calls, moved]).toEqual([1, { distanceMeters: 9000, durationSeconds: 1200 }]);
  });

  it('returns null instead of throwing when the provider fails', async () => {
    const routes = new PropertyRoutes(new RlsDb(pool), new FakeRouting(new Error('HTTP 403')));

    await expect(routes.forProperty(propertyId, 'MUK', { lat: 0.4, lon: 32.6 }, CAMPUS)).resolves.toBeNull();
  });
});
